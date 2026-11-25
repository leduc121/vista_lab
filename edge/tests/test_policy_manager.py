import io
import json
import tempfile
import threading
import time
import unittest
from contextlib import nullcontext
from types import ModuleType, SimpleNamespace
from unittest.mock import patch
from edge.policy_manager import LeRobotPolicyAdapter, PolicyManager, SO101_JOINTS, parse_repo


class Response(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *args): self.close()


class FakeAdapter:
    def __init__(self, prompt=True): self.prompt = prompt; self.seen = None; self.closed = False
    def validate_metadata(self, record): pass
    def act(self, observation, prompt=None): self.seen = prompt; return {"ok": 1}
    def reset(self): pass
    def unload(self): self.closed = True


class PolicyManagerTests(unittest.TestCase):
    def test_mock_model_proposal_is_labeled_timed_and_scoped_for_simulation(self):
        joints = list(SO101_JOINTS)
        proposal = {"jointPositions": [0.0] * 6, "jointNames": joints, "unit": "rad"}
        with tempfile.TemporaryDirectory() as root:
            manager = PolicyManager(root)
            adapter = FakeAdapter()
            adapter.act = lambda observation, prompt=None: proposal
            manager.loader = lambda record, device: adapter
            manager._items["mock"] = {"policyId": "mock", "architecture": "mock", "providerKind": "MOCK_MODEL",
                                       "repositoryId": "tests/mock", "commit": "fixture-1", "supportsPrompt": True,
                                       "status": "NOT_LOADED", "path": root}
            manager.load("mock")
            applied = []
            result = manager.run({"state": [0] * 6}, "move the cube", execute=applied.append,
                                 experiment={"experimentId": "exp-fixture"})
            self.assertEqual(result["providerKind"], "MOCK_MODEL")
            self.assertGreaterEqual(result["inferenceLatencyMs"], 0)
            self.assertEqual(result["model"]["commit"], "fixture-1")
            self.assertEqual(result["experiment"]["experimentId"], "exp-fixture")
            self.assertEqual(applied, [proposal])

    def test_invalid_mock_proposal_and_inference_timeout_never_execute(self):
        with tempfile.TemporaryDirectory() as root:
            manager = PolicyManager(root)
            adapter = FakeAdapter()
            manager.loader = lambda record, device: adapter
            manager._items["mock"] = {"policyId": "mock", "architecture": "mock", "providerKind": "MOCK_MODEL",
                                       "supportsPrompt": False, "status": "NOT_LOADED", "path": root}
            manager.load("mock")
            executed = []
            adapter.act = lambda observation, prompt=None: {"not": "a joint command"}
            with self.assertRaisesRegex(ValueError, "six-joint SO-101"):
                manager.run({}, execute=executed.append)
            adapter.act = lambda observation, prompt=None: (time.sleep(0.12) or {
                "jointPositions": [0.0] * 6, "jointNames": list(SO101_JOINTS), "unit": "rad"})
            with self.assertRaisesRegex(TimeoutError, "proposal discarded"):
                manager.run({}, execute=executed.append, timeout_ms=100)
            self.assertEqual(executed, [])

    def test_missing_local_inference_provider_fails_closed(self):
        with tempfile.TemporaryDirectory() as root:
            manager = PolicyManager(root, loader=lambda record, device: (_ for _ in ()).throw(
                RuntimeError("Install isolated LeRobot 0.6.x inference dependencies.")))
            manager._items["unavailable"] = {"policyId": "unavailable", "architecture": "smolvla",
                "supportsPrompt": True, "status": "NOT_LOADED", "path": root}
            with self.assertRaisesRegex(RuntimeError, "inference dependencies"):
                manager.load("unavailable")
            self.assertIsNone(manager._adapter)
            self.assertEqual(manager._items["unavailable"]["status"], "ERROR")

    def test_experiment_context_rejects_unknown_fields(self):
        with tempfile.TemporaryDirectory() as root:
            manager = PolicyManager(root)
            with self.assertRaisesRegex(ValueError, "unsupported fields"):
                manager.run({}, experiment={"robotId": "must-not-be-sent"})

    def test_inference_only_act_ignores_prompt_without_mapping_robot_actions(self):
        feature = lambda shape, kind: SimpleNamespace(shape=shape, type=kind)
        config = SimpleNamespace(type="act", input_features={
            "observation.state": feature((6,), "STATE"),
            "observation.images.front": feature((3, 2, 2), "VISUAL"),
        }, output_features={"action": feature((6,), "ACTION")})

        class Tensor:
            def __init__(self, values): self.values = list(values); self.ndim = 1
            def detach(self): return self
            def to(self, *args, **kwargs): return self
            def numel(self): return len(self.values)
            def tolist(self): return self.values

        class Torch:
            float32 = "float32"
            inference_mode = staticmethod(nullcontext)
            device = staticmethod(lambda name: name)
            isfinite = staticmethod(lambda value: SimpleNamespace(
                all=lambda: all(__import__("math").isfinite(x) for x in value.values)))
        Torch.Tensor = Tensor

        calls = {"select_action": 0, "task": None}
        def prepare(raw, device, *, task, robot_type):
            calls["task"] = task
            return raw
        utils = ModuleType("lerobot.policies.utils")
        utils.prepare_observation_for_inference = prepare
        policies = ModuleType("lerobot.policies"); policies.__path__ = []
        lerobot = ModuleType("lerobot"); lerobot.__path__ = []

        class Policy:
            def select_action(self, processed):
                calls["select_action"] += 1
                return Tensor([0.1] * 6)

        adapter = LeRobotPolicyAdapter(Policy(), config, lambda value: value,
                                       lambda value: Tensor([0.1] * 6), Torch(), (), False, None)
        observation = {"observation.state": [0] * 6,
                       "observation.images.front": __import__("numpy").zeros((2, 2, 3), dtype="uint8")}
        with patch.dict("sys.modules", {"lerobot": lerobot, "lerobot.policies": policies,
                                        "lerobot.policies.utils": utils}):
            result = adapter.infer(observation, prompt="This prompt must be ignored.")
        self.assertEqual(result, [0.1] * 6)
        self.assertEqual(calls, {"select_action": 1, "task": ""})
        self.assertFalse(adapter.simulation_validated)
        with self.assertRaisesRegex(ValueError, "verified robot/action semantics"):
            adapter.act(observation, prompt="This prompt must be ignored.")

    def test_action_contract_rejects_implicit_units(self):
        feature = lambda shape: SimpleNamespace(shape=shape, type="STATE")
        config = SimpleNamespace(type="act", input_features={"observation.state": feature((6,))},
                                 output_features={"action": feature((6,))})
        follower_names = tuple(f"{name}.pos" for name in SO101_JOINTS)
        adapter = LeRobotPolicyAdapter(None, config, None, None, None, follower_names, False, "so101_follower")
        with self.assertRaisesRegex(ValueError, "use_degrees=true"):
            adapter.validate_metadata({})
        adapter.action_unit = "degrees_mixed"
        self.assertTrue(adapter.validate_metadata({}))
        radian_adapter = LeRobotPolicyAdapter(None, config, None, None, None, SO101_JOINTS, False, "custom")
        with self.assertRaisesRegex(ValueError, "explicit vista_action_unit='rad'"):
            radian_adapter.validate_metadata({})
        radian_adapter.action_unit = "rad"
        self.assertTrue(radian_adapter.validate_metadata({}))

    def test_repo_ids_and_urls(self):
        self.assertEqual(parse_repo("https://huggingface.co/team/model/tree/main"), "team/model")
        with self.assertRaises(ValueError): parse_repo("../escape")

    def test_import_register_and_capabilities(self):
        config = json.dumps({"type": "smolvla", "input_features": {"observation.state": {}}, "output_features": {"action": {}}}).encode()
        train_config = json.dumps({"vista_action_joint_names": ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"]}).encode()
        pre = json.dumps({"steps": []}).encode(); post = json.dumps({"steps": []}).encode()
        checkpoint = b"weights-fixture"
        artifacts = {"config.json": config, "train_config.json": train_config, "policy_preprocessor.json": pre,
                     "policy_postprocessor.json": post, "model.safetensors": checkpoint}
        def requester(req, timeout=20):
            if "/api/models/" in req.full_url:
                return Response(json.dumps({"sha": "abc123", "private": False, "siblings": [
                    {"rfilename": n, "size": len(data)} for n, data in artifacts.items()]}).encode())
            name = req.full_url.split("/resolve/")[1].split("/")[1].split("?")[0]
            return Response(artifacts[name])
        with tempfile.TemporaryDirectory() as root:
            manager = PolicyManager(root, requester=requester)
            record = manager.import_model("team/model", "main")
            self.assertEqual(record["commit"], "abc123")
            self.assertTrue(record["supportsPrompt"])
            self.assertEqual(len(manager.list()), 1)

    def test_import_preflights_disk_before_model_download(self):
        config = b'{"type":"smolvla","input_features":{},"output_features":{}}'
        artifacts = {"config.json": config, "train_config.json": b'{}',
                     "policy_preprocessor.json": b'{"steps":[]}', "policy_postprocessor.json": b'{"steps":[]}',
                     "model.safetensors": b"large-weight-placeholder"}
        calls = []
        def requester(req, timeout=20):
            calls.append(req.full_url)
            if "/api/models/" in req.full_url:
                return Response(json.dumps({"sha": "fixture", "siblings": [
                    {"rfilename": name, "size": len(data)} for name, data in artifacts.items()]}).encode())
            return Response(artifacts[req.full_url.split("/resolve/")[1].split("/")[1].split("?")[0]])
        with tempfile.TemporaryDirectory() as root:
            manager = PolicyManager(root, requester=requester)
            with patch("edge.policy_manager.shutil.disk_usage", return_value=SimpleNamespace(free=1)):
                with self.assertRaisesRegex(OSError, "Insufficient disk space"):
                    manager.import_model("team/model")
            self.assertEqual(len(calls), 1)
            self.assertEqual(len(manager.list()), 0)

    def test_nonprompt_drops_prompt_and_runs_act(self):
        with tempfile.TemporaryDirectory() as root:
            manager = PolicyManager(root, loader=lambda record, device: FakeAdapter())
            record = {"policyId": "one", "architecture": "act", "supportsPrompt": False, "status": "NOT_LOADED", "path": root}
            manager._items["one"] = record
            adapter = FakeAdapter()
            manager.loader = lambda record, device: adapter
            manager.load("one")
            result = manager.run({"state": [1]}, "pick up the red cube")
            self.assertIsNone(adapter.seen)
            self.assertEqual(result["action"], {"ok": 1})
            self.assertFalse(result["promptUsed"])

    def test_prompt_capable_receives_exact_prompt_and_unload(self):
        with tempfile.TemporaryDirectory() as root:
            manager = PolicyManager(root)
            adapter = FakeAdapter()
            manager.loader = lambda record, device: adapter
            manager._items["one"] = {"policyId": "one", "architecture": "smolvla", "supportsPrompt": True, "status": "NOT_LOADED", "path": root}
            manager.load("one")
            prompt = "Place the block inside the container."
            self.assertTrue(manager.run({"state": [0]}, prompt)["promptUsed"])
            self.assertEqual(adapter.seen, prompt)
            manager.unload()
            self.assertTrue(adapter.closed)

    def test_switch_releases_old_adapter_only_after_candidate_validation(self):
        with tempfile.TemporaryDirectory() as root:
            manager = PolicyManager(root)
            first, second = FakeAdapter(), FakeAdapter()
            manager._items.update({
                "one": {"policyId": "one", "architecture": "act", "supportsPrompt": False, "status": "NOT_LOADED", "path": root},
                "two": {"policyId": "two", "architecture": "act", "supportsPrompt": False, "status": "NOT_LOADED", "path": root},
            })
            manager.loader = lambda record, device: first if record["policyId"] == "one" else second
            manager.load("one")
            manager.load("two")
            self.assertTrue(first.closed)
            self.assertEqual(manager._active, "two")
            self.assertEqual(manager._items["two"]["status"], "READY")

    def test_unload_cancels_stale_async_inference_result(self):
        entered, release = threading.Event(), threading.Event()
        class Slow(FakeAdapter):
            def act(self, observation, prompt=None):
                entered.set(); release.wait(2); return {"joint": 1}
        with tempfile.TemporaryDirectory() as root:
            manager = PolicyManager(root)
            manager.loader = lambda record, device: Slow()
            manager._items["one"] = {"policyId": "one", "architecture": "act", "supportsPrompt": False, "status": "NOT_LOADED", "path": root}
            manager.load("one")
            errors = []
            executed = []
            thread = threading.Thread(target=lambda: self._capture(errors, lambda: manager.run({}, "", execute=executed.append)))
            thread.start(); self.assertTrue(entered.wait(1)); manager.unload(); release.set(); thread.join(2)
            self.assertTrue(errors)
            self.assertIn("Stale inference", str(errors[0]))
            self.assertEqual(executed, [])

    @staticmethod
    def _capture(errors, call):
        try: call()
        except Exception as error: errors.append(error)

    def test_unknown_architecture_rejected_without_registry_entry(self):
        config = json.dumps({"type": "arbitrary", "input_features": {}}).encode()
        train = b'{}'; pre = b'{"steps":[]}'; post = b'{"steps":[]}'
        checkpoint = b"weights"
        artifacts = {"config.json": config, "train_config.json": train, "policy_preprocessor.json": pre,
                     "policy_postprocessor.json": post, "model.safetensors": checkpoint}
        def requester(req, timeout=20):
            if "/api/models/" in req.full_url:
                return Response(json.dumps({"sha": "abc", "siblings": [{"rfilename": n, "size": len(data)} for n, data in artifacts.items()]}).encode())
            name = req.full_url.split("/resolve/")[1].split("/")[1].split("?")[0]
            return Response(artifacts[name])
        with tempfile.TemporaryDirectory() as root:
            manager = PolicyManager(root, requester=requester)
            with self.assertRaisesRegex(ValueError, "Unsupported LeRobot architecture"):
                manager.import_model("team/model")
            self.assertEqual(manager.list(), [])


if __name__ == "__main__": unittest.main()
