"""Bounded Hugging Face import and LeRobot 0.6.x ACT/SmolVLA adapters.

Repository Python is never imported or executed. Imported bundles are validated
against the installed LeRobot policy config and VISTA's six-joint SO-101 scene.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Protocol

MAX_FILES = 128
MAX_FILE_BYTES = 2 * 1024**3
MAX_TOTAL_BYTES = 8 * 1024**3
REPO_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$")
# These are the only model families with an adapter in this iteration.
SUPPORTED = {"act", "smolvla"}
DEFAULT_INFERENCE_TIMEOUT_MS = 25_000


class ModelProvider(Protocol):
    """Provider contract: return a validated SO-101 action proposal, never motor I/O."""

    def validate_metadata(self, record: dict[str, Any]) -> bool: ...
    def act(self, observation: dict[str, Any], prompt: str | None = None) -> dict[str, Any]: ...
    def reset(self) -> None: ...
    def unload(self) -> None: ...


class LeRobotPolicyAdapter:
    """LeRobot 0.6.x adapter using the checkpoint's serialized processors."""

    def __init__(self, policy, config, preprocessor, postprocessor, torch, action_names, prompt_capable, robot_type):
        self.policy = policy
        self.config = config
        self.preprocessor = preprocessor
        self.postprocessor = postprocessor
        self.torch = torch
        import numpy as np
        self.np = np
        self.action_names = action_names
        self.prompt_capable = prompt_capable
        self.robot_type = robot_type
        self.simulation_validated = False

    def validate_inference_metadata(self):
        """Validate tensor contracts without asserting actuator semantics."""
        if self.config.type not in SUPPORTED:
            raise ValueError(f"LeRobot architecture {self.config.type!r} is not supported by the installed adapter.")
        if self.config.type == "smolvla" and not self.prompt_capable:
            raise ValueError("SmolVLA config does not expose its expected task prompt capability.")
        inputs = self.config.input_features or {}
        state = inputs.get("observation.state")
        action = (self.config.output_features or {}).get("action")
        if state is None or tuple(state.shape) != (6,):
            raise ValueError("Inference requires a six-value observation.state schema.")
        if action is None or tuple(action.shape) != (6,):
            raise ValueError("Inference requires a six-value action schema.")
        required_images = {key for key, feature in inputs.items() if str(getattr(feature, "type", "")).endswith("VISUAL")}
        unsupported_views = required_images - {"observation.images.top", "observation.images.front", "observation.images.right", "observation.images.wrist"}
        if unsupported_views:
            raise ValueError(f"No observation source is configured for policy image views: {sorted(unsupported_views)}")
        return True

    def validate_metadata(self, record):
        self.validate_inference_metadata()
        inputs = self.config.input_features or {}
        follower_features = all(name.endswith(".pos") and name.removesuffix(".pos") in SO101_JOINTS
                                for name in self.action_names)
        radian_features = all(name in SO101_JOINTS for name in self.action_names)
        if follower_features and (self.robot_type != "so101_follower" or getattr(self, "action_unit", None) != "degrees_mixed"):
            raise ValueError("LeRobot .pos actions require explicit SO-101 follower metadata and use_degrees=true (degrees plus gripper percent).")
        if radian_features and getattr(self, "action_unit", None) != "rad":
            raise ValueError("Bare SO-101 action names require explicit vista_action_unit='rad' metadata.")
        if not follower_features and not radian_features:
            raise ValueError("Policy action features do not match a verified six-joint SO-101 contract.")
        for name in self.action_names:
            joint = name.removesuffix(".pos")
            if joint not in SO101_JOINTS:
                raise ValueError(f"Action feature {name!r} does not map to an SO-101 joint.")
        self.simulation_validated = True
        return True

    def infer(self, observation, prompt=None):
        """Run policy inference and return a six-value tensor result.

        This stage deliberately does not map values into robot joints. It can
        therefore be acceptance-tested without treating model outputs as
        verified actuator commands.
        """
        torch = self.torch
        inputs = self.config.input_features or {}
        raw = {}
        for key, feature in inputs.items():
            value = observation.get(key)
            if key == "observation.state" and value is not None:
                array = self.np.asarray(value, dtype=self.np.float32)
                if tuple(array.shape) != tuple(feature.shape) or not self.np.isfinite(array).all():
                    raise ValueError("SO-101 observation.state failed policy shape/finiteness validation.")
                if self.simulation_validated and self.robot_type == "so101_follower":
                    limits = observation.get("_vista_joint_limits_rad")
                    if not isinstance(limits, dict) or any(name not in limits for name in SO101_JOINTS):
                        raise ValueError("SO-101 joint limits were not supplied by the simulation runtime.")
                    array = array.copy()
                    array[:5] *= 180.0 / 3.141592653589793
                    low, high = limits["gripper"]
                    array[5] = (array[5] - low) / (high - low) * 100.0
                raw[key] = array
            elif key.startswith("observation.images.") and value is not None:
                array = self.np.asarray(value)
                if array.ndim != 3 or array.dtype != self.np.uint8:
                    raise ValueError(f"{key} must be a three-dimensional image.")
                chw_shape = (array.shape[2], array.shape[0], array.shape[1])
                if chw_shape != tuple(feature.shape):
                    raise ValueError(f"{key} image does not match the checkpoint's declared shape.")
                raw[key] = array
            elif value is not None:
                raw[key] = value
            else:
                raise ValueError(f"Required policy observation {key!r} is missing.")
        if self.prompt_capable and (not isinstance(prompt, str) or not prompt.strip()):
            raise ValueError("This SmolVLA checkpoint requires a nonempty task prompt.")
        from lerobot.policies.utils import prepare_observation_for_inference
        prepared = prepare_observation_for_inference(raw, self.torch.device("cpu"),
                                                     task=prompt if self.prompt_capable else "",
                                                     robot_type="so101")
        # The serialized LeRobot pipeline performs its checkpoint-specific
        # normalization and, for SmolVLA, newline/tokenizer preprocessing.
        processed = self.preprocessor(prepared)
        with torch.inference_mode():
            normalized_action = self.policy.select_action(processed)
            action = self.postprocessor(normalized_action)
        if not isinstance(action, torch.Tensor):
            raise ValueError("LeRobot postprocessor did not return a tensor action.")
        action = action.detach().to("cpu", dtype=torch.float32)
        if action.ndim == 2 and action.shape[0] == 1: action = action[0]
        if action.ndim != 1 or action.numel() != 6 or not torch.isfinite(action).all():
            raise ValueError("Policy output must be exactly six finite SO-101 joint values.")
        return [float(x) for x in action.tolist()]

    def act(self, observation, prompt=None):
        if not self.simulation_validated:
            raise ValueError("Simulation action mapping requires verified robot/action semantics.")
        values = self.infer(observation, prompt)
        # LeRobot SO-Follower feature names with `.pos` use its DEGREES mode.
        limits = observation.get("_vista_joint_limits_rad")
        if self.robot_type == "so101_follower" and all(name.endswith(".pos") for name in self.action_names):
            if not isinstance(limits, dict) or any(name not in limits for name in SO101_JOINTS):
                raise ValueError("SO-101 joint limits were not supplied by the simulation runtime.")
            mapping = {}
            for name, value in zip(self.action_names, values, strict=True):
                joint = name.removesuffix(".pos")
                if joint not in SO101_JOINTS: raise ValueError(f"Action feature {name!r} does not name an SO-101 motor.")
                if joint == "gripper":
                    if not 0 <= value <= 100: raise ValueError("SO-101 gripper output must be in LeRobot's 0–100 position range.")
                    low, high = limits[joint]; value = low + value / 100.0 * (high - low)
                else:
                    value *= 3.141592653589793 / 180.0
                mapping[joint] = value
        elif all(name in SO101_JOINTS for name in self.action_names):
            mapping = dict(zip(self.action_names, values, strict=True))
        else:
            raise ValueError("Checkpoint action names/units do not match a verified SO-101 feature contract.")
        if set(mapping) != set(SO101_JOINTS):
            raise ValueError("Policy action names must map one-to-one to the six SO-101 joints.")
        return {"jointPositions": [mapping[name] for name in SO101_JOINTS], "unit": "rad", "jointNames": list(SO101_JOINTS)}

    def reset(self):
        self.policy.reset()

    def unload(self):
        self.reset()
        del self.preprocessor, self.postprocessor, self.policy
        if self.torch.cuda.is_available(): self.torch.cuda.empty_cache()


SO101_JOINTS = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")


def load_lerobot_policy(record, device="cpu", *, inference_only=False):
    try:
        import lerobot
        import torch
        from packaging.version import Version
        from lerobot.configs.policies import PreTrainedConfig
        from lerobot.policies import get_policy_class, make_pre_post_processors
    except ImportError as error:
        raise RuntimeError("Install the isolated LeRobot 0.6.x policy dependencies before loading this model.") from error
    version = getattr(lerobot, "__version__", "unknown")
    if version == "unknown" or Version(version).release[:2] != (0, 6):
        raise RuntimeError(f"Policy adapter requires LeRobot 0.6.x; found {version}.")
    if device != "cpu":
        raise ValueError("Only CPU inference is enabled in this runtime; no supported accelerator is available.")
    checkpoint = Path(record["path"])
    weight_files = [p for p in checkpoint.glob("*.safetensors") if p.name.startswith("model")]
    if not weight_files: raise ValueError("Policy checkpoint weights are missing.")
    available = _available_memory_bytes()
    estimate = sum(p.stat().st_size for p in weight_files) * 3
    if available is not None and available < estimate:
        raise MemoryError(f"Policy needs an estimated {estimate // (1024**2)} MiB; only {available // (1024**2)} MiB is available.")
    config = PreTrainedConfig.from_pretrained(str(checkpoint))
    if config.type not in SUPPORTED: raise ValueError(f"Unsupported LeRobot architecture {config.type!r}.")
    config.device = "cpu"
    policy_cls = get_policy_class(config.type)
    if config.type == "act":
        # The checkpoint contains the vision backbone; do not make an implicit
        # second download of torchvision's initialization weights.
        config.pretrained_backbone_weights = None
    policy = policy_cls.from_pretrained(str(checkpoint), config=config, local_files_only=True, strict=True)
    policy.to("cpu").eval()
    pre, post = make_pre_post_processors(config, pretrained_path=str(checkpoint),
                                        preprocessor_overrides={"device_processor": {"device": "cpu"}},
                                        postprocessor_overrides={"device_processor": {"device": "cpu"}})
    robot_type = record.get("robotType")
    train_path = checkpoint / "train_config.json"
    train_config = json.loads(train_path.read_text())
    names = () if inference_only else _action_feature_names(checkpoint, robot_type)
    prompt = config.type == "smolvla"
    adapter = LeRobotPolicyAdapter(policy, config, pre, post, torch, names, prompt, robot_type)
    action_feature = (config.output_features or {}).get("action")
    adapter.action_unit = train_config.get("vista_action_unit") or getattr(action_feature, "unit", None)
    train_robot = train_config.get("robot") if isinstance(train_config.get("robot"), dict) else {}
    if adapter.action_unit is None and (train_config.get("use_degrees") is True or train_robot.get("use_degrees") is True):
        adapter.action_unit = "degrees_mixed"
    if inference_only:
        adapter.validate_inference_metadata()
    else:
        adapter.validate_metadata(record)
    return adapter


def _available_memory_bytes():
    try:
        pages = os.sysconf("SC_AVPHYS_PAGES")
        page_size = os.sysconf("SC_PAGE_SIZE")
        return int(pages * page_size)
    except (ValueError, OSError, AttributeError): return None


def _action_feature_names(checkpoint: Path, robot_type: str | None):
    train = checkpoint / "train_config.json"
    if not train.is_file(): raise ValueError("Checkpoint must include train_config.json with ordered SO-101 action names.")
    config = json.loads(train.read_text())
    candidates = [config.get("vista_action_joint_names"),
                  config.get("dataset", {}).get("features", {}).get("action", {}).get("names"),
                  config.get("policy", {}).get("output_features", {}).get("action", {}).get("names")]
    names = next((x for x in candidates if isinstance(x, list)), None)
    if names is None and robot_type == "so101_follower":
        names = [f"{name}.pos" for name in SO101_JOINTS]
    if not names or len(names) != 6 or not all(isinstance(x, str) for x in names):
        raise ValueError("Checkpoint must identify SO-101 action order in metadata or declare robot_type=so101_follower.")
    if len(set(names)) != 6: raise ValueError("Checkpoint action feature names are duplicated.")
    return tuple(names)


def parse_repo(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("Enter a Hugging Face repository ID or URL.")
    value = value.strip()
    if value.startswith("https://huggingface.co/"):
        value = urllib.parse.urlparse(value).path.strip("/").split("/tree/")[0].split("/blob/")[0]
    if not REPO_RE.fullmatch(value):
        raise ValueError("Repository must be an owner/name ID or huggingface.co model URL.")
    return value


class PolicyManager:
    def __init__(self, model_dir: str | Path | None = None, *, loader=None, requester=None):
        self.model_dir = Path(model_dir or os.environ.get("VISTA_POLICY_MODEL_DIR") or (Path.home() / ".local/share/vista-lab-station/models")).expanduser().resolve()
        # Do not touch the user's profile on runtime startup; importing a model
        # is the explicit operation that creates this managed directory.
        self.loader = loader or load_lerobot_policy
        self.requester = requester or urllib.request.urlopen
        self._lock = threading.RLock()
        self._inference_lock = threading.Lock()
        self._generation = 0
        self._switching = False
        self._active = None
        self._adapter: ModelProvider | None = None
        self._items: dict[str, dict[str, Any]] = {}
        self._restore()

    def _restore(self):
        if not self.model_dir.is_dir(): return
        for manifest in self.model_dir.glob("*/vista-policy.json"):
            try:
                record = json.loads(manifest.read_text())
                if record.get("policyId") and (manifest.parent / "config.json").is_file():
                    record.update(status="NOT_LOADED", path=str(manifest.parent), lastValidation="restored metadata; validation required")
                    self._items[record["policyId"]] = record
            except (OSError, ValueError):
                continue

    @staticmethod
    def _headers():
        token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
        return {"Authorization": f"Bearer {token}"} if token else {}

    def inspect(self, repo: str, revision: str = "main"):
        repo = parse_repo(repo)
        if not isinstance(revision, str) or not re.fullmatch(r"[A-Za-z0-9._/-]{1,128}", revision) or ".." in revision:
            raise ValueError("Revision is invalid.")
        url = f"https://huggingface.co/api/models/{repo}/revision/{urllib.parse.quote(revision, safe='/')}"
        request = urllib.request.Request(url, headers=self._headers())
        try:
            with self.requester(request, timeout=20) as response: data = json.loads(response.read(2_000_000))
        except urllib.error.HTTPError as error:
            if error.code == 401: raise PermissionError("Hugging Face authentication failed; configure HF_TOKEN in the main process.") from error
            if error.code == 404: raise ValueError("Hugging Face repository or revision was not found.") from error
            raise RuntimeError(f"Hugging Face metadata request failed ({error.code}).") from error
        files = data.get("siblings", [])
        names = [item.get("rfilename") for item in files if isinstance(item, dict)]
        config = next((name for name in names if name in {"config.json", "policy_config.json"}), None)
        if not config: raise ValueError("Repository has no supported LeRobot policy config.")
        digest = data.get("sha") or revision
        card_data = data.get("cardData") or {}
        return {"repositoryId": repo, "revision": revision, "commit": digest, "files": names, "configFile": config,
                "private": bool(data.get("private")), "license": card_data.get("license"), "siblings": files}

    def import_model(self, repo: str, revision: str = "main", progress=None):
        meta = self.inspect(repo, revision)
        if len(meta["siblings"]) > MAX_FILES: raise ValueError("Repository contains too many files for managed import.")
        required = {meta["configFile"], "train_config.json", "policy_preprocessor.json", "policy_postprocessor.json"}
        required.update(name for name in ("README.md", "LICENSE", "LICENSE.md") if name in meta["files"])
        required.update(n for n in meta["files"] if n.startswith(("policy_preprocessor_step_", "policy_postprocessor_step_")) and n.endswith(".safetensors"))
        required.update(n for n in meta["files"] if re.fullmatch(r"model(?:-\d+-of-\d+)?\.safetensors", n))
        missing = required - set(meta["files"])
        if missing: raise ValueError(f"Incomplete LeRobot inference bundle; missing: {', '.join(sorted(missing))}.")
        selected = [item for item in meta["siblings"] if item.get("rfilename") in required]
        sizes = []
        for item in selected:
            raw_size = item.get("size")
            if not isinstance(raw_size, int): raw_size = (item.get("lfs") or {}).get("size")
            if not isinstance(raw_size, int) or raw_size < 0:
                raise ValueError("Model repository omits artifact sizes; inspect a version with complete size metadata before downloading.")
            if raw_size > MAX_FILE_BYTES: raise ValueError(f"Artifact exceeds the {MAX_FILE_BYTES // 1024**3} GiB per-file limit.")
            sizes.append(raw_size)
        estimated_bytes = sum(sizes)
        if estimated_bytes > MAX_TOTAL_BYTES: raise ValueError("Model bundle exceeds the managed size limit.")
        probe = self.model_dir
        while not probe.exists() and probe != probe.parent: probe = probe.parent
        available_bytes = shutil.disk_usage(probe).free
        if available_bytes < estimated_bytes + 64 * 1024**2:
            raise OSError(f"Insufficient disk space: model needs about {estimated_bytes // (1024**2)} MiB plus 64 MiB safety margin.")
        self.model_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        try: self.model_dir.chmod(0o700)
        except OSError: pass
        repo_key = hashlib.sha256(meta["repositoryId"].encode()).hexdigest()[:20]
        target = (self.model_dir / f"{repo_key}-{hashlib.sha256(meta['commit'].encode()).hexdigest()[:12]}").resolve()
        if self.model_dir not in target.parents: raise ValueError("Unsafe model destination.")
        temp = self.model_dir / f".import-{uuid.uuid4().hex}"
        temp.mkdir(mode=0o700)
        try:
            siblings = meta["siblings"]
            total = 0; manifest = []
            selected = [item for item in siblings if item.get("rfilename") in required]
            if not any(x.get("rfilename") == meta["configFile"] for x in selected): raise ValueError("Policy config is missing.")
            for item in selected:
                name = item["rfilename"]
                relative = Path(name)
                if relative.is_absolute() or ".." in relative.parts or len(name) > 240: raise ValueError("Repository contains an unsafe artifact path.")
                size = item.get("size")
                if not isinstance(size, int): size = (item.get("lfs") or {}).get("size")
                if isinstance(size, int) and (size < 0 or size > MAX_FILE_BYTES): raise ValueError(f"Artifact exceeds the {MAX_FILE_BYTES // 1024**3} GiB per-file limit.")
                url = f"https://huggingface.co/{meta['repositoryId']}/resolve/{urllib.parse.quote(meta['commit'], safe='')}/{urllib.parse.quote(name, safe='/')}?download=true"
                req = urllib.request.Request(url, headers=self._headers())
                dest = temp / relative; dest.parent.mkdir(parents=True, exist_ok=True)
                digest = hashlib.sha256(); written = 0
                with self.requester(req, timeout=60) as response, dest.open("wb") as output:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk: break
                        written += len(chunk); total += len(chunk)
                        if written > MAX_FILE_BYTES or total > MAX_TOTAL_BYTES: raise ValueError("Model download exceeded the managed size limit.")
                        digest.update(chunk); output.write(chunk)
                        if progress: progress({"file": name, "downloadedBytes": total})
                if isinstance(size, int) and size != written: raise ValueError(f"Artifact size mismatch: {name}.")
                lfs = item.get("lfs") or {}
                expected = lfs.get("sha256")
                if expected and digest.hexdigest() != expected: raise ValueError(f"Artifact integrity check failed: {name}.")
                manifest.append({"path": name, "size": written, "sha256": digest.hexdigest()})
            config = json.loads((temp / meta["configFile"]).read_text())
            train_config = json.loads((temp / "train_config.json").read_text())
            arch = config.get("type") or config.get("policy_type") or config.get("policy", {}).get("type")
            if not isinstance(arch, str) or arch.lower() not in SUPPORTED:
                raise ValueError(f"Unsupported LeRobot architecture: {arch or 'unknown'}. Supported: {', '.join(sorted(SUPPORTED))}.")
            weights = [x for x in manifest if x["path"].endswith((".safetensors", ".pt", ".pth"))]
            if not weights: raise ValueError("Policy checkpoint is missing.")
            inputs = config.get("input_features", {})
            prompt = arch.lower() == "smolvla"
            pid = hashlib.sha256(f"{meta['repositoryId']}@{meta['commit']}".encode()).hexdigest()[:24]
            readme_path = temp / "README.md"
            readme = readme_path.read_text(errors="ignore") if readme_path.is_file() else ""
            robot_type = config.get("robot_type") or config.get("robot", {}).get("type")
            if not robot_type:
                match = re.search(r"(?im)^\s*[-*]?\s*\*{0,2}robot type\*{0,2}:?\s*[`* ]*(so[-_ ]?101(?:_follower)?|so[-_ ]?follower)[`* ]*", readme)
                if match: robot_type = "so101_follower"
            record = {"policyId": pid, "repositoryId": meta["repositoryId"], "revision": meta["revision"], "commit": meta["commit"],
                      "architecture": arch.lower(), "providerKind": "LEROBOT_MODEL", "path": str(target), "status": "NOT_LOADED", "supportsPrompt": prompt,
                      "robotType": robot_type,
                      "actionUnit": train_config.get("vista_action_unit") or
                                   ("degrees_mixed" if train_config.get("use_degrees") is True or
                                    (train_config.get("robot", {}).get("use_degrees") is True
                                     if isinstance(train_config.get("robot"), dict) else False) else
                                    config.get("output_features", {}).get("action", {}).get("unit")),
                      "observationRequirements": config.get("input_features", {}), "actionRequirements": config.get("output_features", {}),
                      "runtimeCompatibility": "LeRobot 0.6.x ACT/SmolVLA adapter; CPU; six-joint SO-101 simulation",
                      "deviceCompatibility": ["cpu"],
                      "license": config.get("license") or meta.get("license") or "See Hugging Face repository metadata", "artifacts": manifest,
                      "lastValidation": "config and checkpoint presence validated; runtime load pending"}
            (temp / "vista-policy.json").write_text(json.dumps(record, indent=2))
            if target.exists(): shutil.rmtree(target)
            temp.rename(target); record["path"] = str(target)
            (target / "vista-policy.json").write_text(json.dumps(record, indent=2))
            with self._lock: self._items[pid] = record
            return self.public(record)
        except Exception:
            shutil.rmtree(temp, ignore_errors=True)
            raise

    @staticmethod
    def public(record):
        return {k: v for k, v in record.items() if k not in {"token", "siblings"}}

    def list(self):
        with self._lock: return [self.public(x) for x in self._items.values()]

    def active_input_features(self):
        with self._lock:
            if not self._active or not self._adapter: raise RuntimeError("Load a compatible policy before inference.")
            return self._adapter.config.input_features

    def load(self, policy_id: str, device="cpu"):
        with self._lock:
            record = self._items.get(policy_id)
            if not record: raise ValueError("Installed policy was not found.")
            if record["status"] == "RUNNING": raise RuntimeError("Stop policy inference before switching policies.")
            record["status"] = "LOADING"; self._switching = True; self._generation += 1; generation = self._generation
            old = self._adapter
        try:
            if self.loader is None: raise RuntimeError("LeRobot policy inference dependencies are not installed in this Edge Runtime.")
            adapter = self.loader(record, device)
            adapter.validate_metadata(record)
            with self._inference_lock:
                with self._lock:
                    if generation != self._generation:
                        adapter.unload(); raise RuntimeError("Policy load was superseded.")
                    self._adapter = adapter; self._active = policy_id; record["status"] = "READY"; self._switching = False
                if old and old is not adapter:
                    old.reset(); old.unload()
            return self.public(record)
        except Exception:
            with self._lock:
                if generation == self._generation: self._switching = False
                record["status"] = "ERROR"
                if self._adapter is None and old is not None:
                    self._adapter = old
            raise

    def run(self, observation, prompt="", execute=None, *, timeout_ms=DEFAULT_INFERENCE_TIMEOUT_MS, experiment=None):
        if isinstance(timeout_ms, bool) or not isinstance(timeout_ms, int) or not 100 <= timeout_ms <= 120_000:
            raise ValueError("Inference timeout must be 100–120000 milliseconds.")
        if experiment is not None:
            if not isinstance(experiment, dict) or set(experiment) - {"experimentId", "attemptId", "episodeId"}:
                raise ValueError("Experiment metadata contains unsupported fields.")
            for key, value in experiment.items():
                if not isinstance(value, str) or not 1 <= len(value) <= 128 or any(ord(c) < 32 for c in value):
                    raise ValueError(f"Experiment metadata {key} must be a bounded printable string.")
        with self._inference_lock:
            with self._lock:
                if self._switching: raise RuntimeError("Policy switching is in progress.")
                if not self._active or not self._adapter: raise RuntimeError("Load a compatible policy before inference.")
                if not isinstance(prompt, str) or len(prompt) > 1000: raise ValueError("Task prompt must be at most 1000 characters.")
                generation = self._generation; adapter = self._adapter; policy_id = self._active
                record = self._items[policy_id]; record["status"] = "RUNNING"
            try:
                started = time.monotonic()
                action = adapter.act(observation, prompt=prompt if record["supportsPrompt"] else None)
                latency_ms = max(0, round((time.monotonic() - started) * 1000))
                if latency_ms > timeout_ms:
                    raise TimeoutError(f"Model inference exceeded its {timeout_ms} ms budget; proposal discarded.")
                with self._lock:
                    if generation != self._generation: raise RuntimeError("Stale inference result discarded after policy switch.")
                if execute is not None:
                    if (not isinstance(action, dict) or action.get("unit") != "rad" or
                        action.get("jointNames") != list(SO101_JOINTS) or
                        not isinstance(action.get("jointPositions"), list) or len(action["jointPositions"]) != len(SO101_JOINTS) or
                        any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
                            for value in action["jointPositions"])):
                        raise ValueError("Model proposal failed the six-joint SO-101 safety contract.")
                result = {"policyId": policy_id, "action": action,
                          "promptUsed": bool(prompt and record["supportsPrompt"]), "motionEnabled": False,
                          "inferenceLatencyMs": latency_ms,
                          "observationSummary": {
                              "jointNames": list(SO101_JOINTS),
                              "jointPositionsRad": [float(value) for value in observation.get("observation.state", [])]
                              if isinstance(observation.get("observation.state"), (list, tuple)) else [],
                              "imageViews": sorted(key for key in observation if key.startswith("observation.images.")),
                          },
                          "providerKind": record.get("providerKind", "UNVERIFIED_MODEL"),
                          "model": {"architecture": record.get("architecture", "unknown"),
                                    "repositoryId": record.get("repositoryId"), "commit": record.get("commit")},
                          "experiment": experiment or {}}
                if execute is not None: result["simulation"] = execute(action)
                return result
            finally:
                with self._lock:
                    if record["status"] == "RUNNING": record["status"] = "READY"

    def unload(self):
        with self._lock:
            self._generation += 1; adapter = self._adapter; pid = self._active
            self._adapter = None; self._active = None
            if pid: self._items[pid]["status"] = "NOT_LOADED"
        if adapter:
            with self._inference_lock:
                adapter.reset(); adapter.unload()
        return {"activePolicyId": None, "motionEnabled": False}

    def stop(self):
        with self._lock:
            self._generation += 1
            adapter = self._adapter
            if self._active: self._items[self._active]["status"] = "READY"
        if adapter:
            with self._inference_lock: adapter.reset()
        return {"activePolicyId": self._active, "stopped": True, "motionEnabled": False}

    def invalidate_pending(self):
        """Invalidate an in-flight proposal without waiting for provider inference to return."""
        with self._lock:
            self._generation += 1
            return {"activePolicyId": self._active, "cancelRequested": True, "motionEnabled": False}
