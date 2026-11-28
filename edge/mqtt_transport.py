"""Fail-closed AWS IoT edge protocol (never carries servo setpoints)."""
from __future__ import annotations

import json
import math
import os
import re
import ssl
import tempfile
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any, Callable
from uuid import UUID

MAX_MESSAGE_BYTES = 64 * 1024
MAX_COMMAND_TTL_MS = 60_000
ROBOT_ID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
RUN_ID_RE = re.compile(r"^wf03-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
THING_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
ALLOWED_STEPS = {"arm.select", "home", "gripper.open", "gripper.close", "wait"}
JOINTS = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")
FORBIDDEN = ("joint", "servo", "motor", "trajectory", "teleop", "setpoint", "velocity", "torque")


def _contains_control(value: Any) -> bool:
    if isinstance(value, dict):
        return any(any(word in str(k).replace("_", "").lower() for word in FORBIDDEN) or _contains_control(v) for k, v in value.items())
    if isinstance(value, list):
        return any(_contains_control(v) for v in value)
    return False


class MqttTransport:
    """Contract v1 MQTT transport. A supplied safety gate is required before execution."""
    def __init__(self, *, host: str, thing_name: str, robot_id: str, ca_file: str,
                 cert_file: str, key_file: str, authorize: Callable[[dict], bool],
                 safety_ready: Callable[[], bool], on_command: Callable[[dict], Any],
                 safety_controller: Any | None = None,
                 dedupe_path: str, client_factory: Callable[..., Any] | None = None,
                 port: int = 8883, topic_prefix: str = "vista/demo/robots",
                 heartbeat_interval: float = 10.0,
                 runtime_kind: str = "PHYSICAL_ROBOT",
                 allow_local_test: bool = False,
                 on_command_envelope: Callable[[dict], Any] | None = None,
                 shadow_state: Callable[[], dict[str, Any]] | None = None) -> None:
        if not isinstance(host, str) or not host or len(host) > 253 or any(c in host for c in "/@ "):
            raise ValueError("A valid AWS IoT endpoint hostname is required.")
        if not THING_RE.fullmatch(thing_name) or not ROBOT_ID_RE.fullmatch(robot_id):
            raise ValueError("Thing name or database robot UUID is invalid.")
        try: UUID(robot_id)
        except ValueError as error: raise ValueError("robotId must be a database UUID.") from error
        if not re.fullmatch(r"[A-Za-z0-9/_-]{1,160}", topic_prefix) or topic_prefix.startswith("/") or topic_prefix.endswith("/"):
            raise ValueError("MQTT topic prefix is invalid.")
        if port != 8883 or not 5 <= heartbeat_interval <= 10:
            raise ValueError("AWS IoT requires port 8883 and a heartbeat from 5 to 10 seconds.")
        if runtime_kind not in {"PHYSICAL_ROBOT", "SIMULATION", "MOCK_RUNTIME"}:
            raise ValueError("MQTT runtime kind is invalid.")
        if runtime_kind != "PHYSICAL_ROBOT" and not allow_local_test:
            raise PermissionError("Non-physical MQTT runtime is available only to injected local tests.")
        self.host, self.port, self.thing_name, self.robot_id = host, port, thing_name, robot_id
        self.prefix = f"{topic_prefix}/{robot_id}"
        self.ca_file, self.cert_file, self.key_file = map(str, (ca_file, cert_file, key_file))
        self.authorize, self.safety_ready, self.on_command = authorize, safety_ready, on_command
        self.on_command_envelope = on_command_envelope
        self.shadow_state = shadow_state
        self.safety_controller = safety_controller
        self.dedupe_path, self.client_factory = str(dedupe_path), client_factory
        self.heartbeat_interval = heartbeat_interval
        self.runtime_kind, self.allow_local_test = runtime_kind, allow_local_test
        self.client = None
        self.connected = threading.Event()
        self.heartbeat_timer: threading.Timer | None = None
        self.last_error: str | None = None
        self.last_command: str | None = None
        self.last_telemetry_sequence = -1
        self._telemetry_run_counts: dict[str, int] = {}
        self._telemetry_run_last_publish: dict[str, float] = {}
        # Lifecycle event sequence is distinct from the measured-frame counter.
        # The contract requires telemetry events to follow ACK/executing events.
        self._command_event_sequences: dict[str, int] = {}
        self._active_telemetry_commands: set[str] = set()
        self.lock = threading.RLock()
        self.dedupe_healthy = True
        self.seen: OrderedDict[str, list[dict[str, Any]]] = OrderedDict()
        self.seen_started: dict[str, int] = {}
        try:
            stored = json.loads(Path(self.dedupe_path).read_text(encoding="utf-8"))
            if not isinstance(stored, dict): raise ValueError("dedupe state is not an object")
            now = int(time.time() * 1000)
            for key, entry in stored.items():
                if (isinstance(key, str) and ROBOT_ID_RE.fullmatch(entry.get("robotId", ""))
                        and isinstance(entry.get("expiresAtMs"), int) and entry["expiresAtMs"] > now
                        and isinstance(entry.get("events"), list)):
                    self.seen[key] = entry["events"]
                    self.seen_started[key] = now
        except FileNotFoundError: pass
        except Exception as error:
            self.last_error = f"Persistent MQTT dedupe state is invalid: {error}"
            self.dedupe_healthy = False

    @property
    def topics(self) -> dict[str, str]:
        return {name: f"{self.prefix}/{name}" for name in ("commands", "ack", "status", "telemetry")}

    def _check_files(self) -> None:
        for filename in (self.ca_file, self.cert_file, self.key_file):
            if not Path(filename).is_file(): raise RuntimeError("Provisioned CA/certificate/key files are incomplete.")
        if os.name == "nt": raise PermissionError("MQTT private-key ACL validation is unavailable on Windows; transport remains disabled.")
        if os.stat(self.key_file).st_mode & 0o077: raise PermissionError("Device private key must be restricted to its owner (0600).")

    def connect(self, timeout: float = 8.0) -> dict[str, Any]:
        if self.runtime_kind != "PHYSICAL_ROBOT":
            if not self.allow_local_test:
                raise PermissionError("Simulation/test MQTT transports cannot connect to AWS IoT.")
            return self.connect_local_test(timeout=timeout)
        if os.environ.get("VISTA_IOT_ENABLED") != "true": raise PermissionError("AWS IoT is disabled by operator policy (VISTA_IOT_ENABLED is not true).")
        if self.safety_controller is None or not callable(getattr(self.safety_controller, "mqtt_ready", None)):
            raise PermissionError("A unified LocalSafetyController is required before MQTT can connect.")
        self._check_files()
        if not self.dedupe_healthy: raise RuntimeError(self.last_error or "Persistent command dedupe is unavailable.")
        if self.client is not None: raise RuntimeError("MQTT transport is already initialized.")
        try: import paho.mqtt.client as mqtt
        except ImportError as error: raise RuntimeError("paho-mqtt is unavailable in this Edge Runtime.") from error
        factory = self.client_factory or mqtt.Client
        client = factory(callback_api_version=mqtt.CallbackAPIVersion.VERSION2, client_id=self.thing_name,
                         protocol=mqtt.MQTTv311, clean_session=True)
        client.tls_set(ca_certs=self.ca_file, certfile=self.cert_file, keyfile=self.key_file,
                       cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLSv1_2)
        client.tls_insecure_set(False)
        client.reconnect_delay_set(min_delay=1, max_delay=30)
        client.will_set(f"$aws/things/{self.thing_name}/shadow/update",
                        json.dumps({"state": {"reported": self._reported(connection="offline")}}, separators=(",", ":")), qos=1, retain=False)
        client.on_connect, client.on_disconnect, client.on_message = self._on_connect, self._on_disconnect, self._on_message
        return self._activate_client(client, self.host, self.port, timeout)

    def connect_local_test(self, timeout: float = 2.0) -> dict[str, Any]:
        """Connect an injected local broker fake; this path cannot contact AWS."""
        if not self.allow_local_test or self.runtime_kind == "PHYSICAL_ROBOT":
            raise PermissionError("Local mock MQTT is restricted to explicitly injected simulation tests.")
        if self.client is not None:
            raise RuntimeError("MQTT transport is already initialized.")
        if self.client_factory is None:
            raise RuntimeError("An injected local MQTT client is required.")
        client = self.client_factory()
        client.will_set(f"$aws/things/{self.thing_name}/shadow/update",
                        json.dumps({"state": {"reported": self._reported(connection="offline")}}, separators=(",", ":")), qos=1, retain=False)
        client.on_connect, client.on_disconnect, client.on_message = self._on_connect, self._on_disconnect, self._on_message
        return self._activate_client(client, "127.0.0.1", 1883, timeout, max_timeout=10,
                                     timeout_message="Local mock MQTT connection timed out.")

    def _activate_client(self, client: Any, host: str, port: int, timeout: float, *,
                         max_timeout: float = 30, timeout_message: str = "MQTT TLS connection timed out.") -> dict[str, Any]:
        self.client = client
        loop_started = False
        try:
            client.connect(host, port, keepalive=30)
            client.loop_start()
            loop_started = True
            if not self.connected.wait(max(.1, min(timeout, max_timeout))):
                raise TimeoutError(timeout_message)
            return self.status()
        except Exception:
            self.connected.clear()
            self._cancel_heartbeat()
            if self.client is client:
                self.client = None
            try:
                client.disconnect()
            except Exception:
                pass
            if loop_started:
                try:
                    client.loop_stop()
                except Exception:
                    pass
            raise

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        code = int(getattr(reason_code, "value", reason_code))
        if code != 0: self.last_error = f"AWS IoT rejected connection ({code})."; return
        result, _ = client.subscribe(self.topics["commands"], qos=1)
        if result != 0: self.last_error = "AWS IoT command subscription failed."; return
        self.last_error = None
        self.connected.set()
        self._publish_shadow("online")
        self._schedule_heartbeat()

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties=None):
        self.connected.clear(); self._cancel_heartbeat()
        if int(getattr(reason_code, "value", reason_code)) != 0: self.last_error = "MQTT connection lost; commands are not queued."

    def _event(self, command_id: str, kind: str, status: str, sequence: int, occurred: int, code: str | None = None) -> dict[str, Any]:
        event = {"schemaVersion": 1, "kind": kind, "robotId": self.robot_id, "commandId": command_id,
                 "status": status, "eventId": f"{command_id}:{kind}:{status}", "sequence": sequence,
                 "occurredAtMs": occurred, "atMs": occurred}
        if code: event["code"] = code
        return event

    def _publish_events(self, events: list[dict[str, Any]]) -> None:
        for event in events:
            self.client.publish(self.topics["ack"] if event["kind"] == "ack" else self.topics["status"],
                                json.dumps(event, separators=(",", ":")), qos=1, retain=False)

    def _reject(self, command_id: str, sequence: int, code: str) -> None:
        now = int(time.time() * 1000)
        event = self._event(command_id, "ack", "rejected", sequence, now, code)
        self._publish_events([event])

    def _on_message(self, client, userdata, message):
        command_id, sequence = "", 0
        resource = None
        lease_acquired = False
        try:
            if message.topic != self.topics["commands"]: raise ValueError("command_identity_invalid")
            if len(message.payload) > MAX_MESSAGE_BYTES: raise ValueError("command_payload_invalid")
            envelope = json.loads(message.payload.decode("utf-8"))
            if not isinstance(envelope, dict): raise ValueError("command_invalid_json")
            command_id, sequence = envelope.get("commandId", ""), envelope.get("sequence", 0)
            if getattr(message, "retain", False): raise ValueError("command_replayed")
            if not isinstance(command_id, str) or not re.fullmatch(r"[0-9a-f-]{36}", command_id, re.I): raise ValueError("command_invalid")
            UUID(command_id)
            now = int(time.time() * 1000)
            issued, expires = envelope.get("issuedAtMs"), envelope.get("expiresAtMs")
            if (envelope.get("schemaVersion") != 1 or envelope.get("kind") != "run" or envelope.get("robotId") != self.robot_id
                    or isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 1): raise ValueError("command_identity_invalid")
            if (isinstance(issued, bool) or not isinstance(issued, int) or isinstance(expires, bool) or not isinstance(expires, int)
                    or issued > now + 5_000 or expires <= now or expires <= issued or expires - issued > MAX_COMMAND_TTL_MS): raise ValueError("command_expired")
            payload = envelope.get("payload")
            program = payload.get("program") if isinstance(payload, dict) else None
            if (not isinstance(payload, dict) or set(payload) != {"runId", "robotId", "programVersionId", "profile", "program"}
                    or not isinstance(payload.get("runId"), str) or not RUN_ID_RE.fullmatch(payload["runId"])
                    or payload.get("robotId") != self.robot_id
                    or not isinstance(payload.get("programVersionId"), str) or not payload["programVersionId"]
                    or payload.get("profile") != "lesson"
                    or not isinstance(program, dict) or program.get("kind") != "robot_program" or program.get("schemaVersion") != 1
                    or not isinstance(program.get("steps"), list) or not 1 <= len(program["steps"]) <= 200): raise ValueError("command_payload_invalid")
            for step in program["steps"]:
                if not isinstance(step, dict) or step.get("type") not in ALLOWED_STEPS or _contains_control(step): raise ValueError("command_payload_invalid")
                fields = {"arm.select": {"type", "arm"}, "home": {"type", "arm"}, "gripper.open": {"type", "arm"}, "gripper.close": {"type", "arm"}, "wait": {"type", "durationMs"}}[step["type"]]
                if set(step) - fields or (step["type"] == "arm.select" and set(step) != fields): raise ValueError("command_payload_invalid")
                if step["type"] == "wait" and (isinstance(step.get("durationMs"), bool) or not isinstance(step.get("durationMs"), int) or not 0 <= step["durationMs"] <= 5000): raise ValueError("command_payload_invalid")
                if step["type"] in {"arm.select", "home", "gripper.open", "gripper.close"} and step.get("arm") not in (None, "left", "right"): raise ValueError("command_payload_invalid")
            with self.lock:
                prior = self.seen.get(command_id)
                if prior is not None:
                    if prior: self._publish_events(prior)
                    else: self._reject(command_id, sequence, "command_replayed")
                    return
                if any(e.get("robotId") == self.robot_id and e.get("sequence", 0) >= sequence for events in self.seen.values() for e in events): raise ValueError("command_replayed")
            if not self.authorize(envelope): raise ValueError("runtime_rejected")
            if not self.safety_ready(): raise ValueError("runtime_not_ready")
            if self.runtime_kind == "PHYSICAL_ROBOT" and not self.safety_controller.mqtt_ready(): raise ValueError("hardware_not_commissioned")
            # The safety lease uses the same resource key as every other
            # controller of this physical or simulated follower.
            resource = "follower-a" if self.runtime_kind == "PHYSICAL_ROBOT" else "local-so101-simulation"
            self.safety_controller.acquire(resource, "MQTT", runtime_kind=self.runtime_kind,
                                           robot_id=self.robot_id, calibrated=True,
                                           hardware_authorized=self.runtime_kind == "PHYSICAL_ROBOT", device_role="follower")
            lease_acquired = True
            with self.lock:
                prior = self.seen.get(command_id)
                if prior is not None:
                    if prior: self._publish_events(prior)
                    self.safety_controller.release(resource, reason="duplicate_command")
                    lease_acquired = False
                    if not prior: self._reject(command_id, sequence, "command_replayed")
                    return
                if any(e.get("robotId") == self.robot_id and e.get("sequence", 0) >= sequence for events in self.seen.values() for e in events): raise ValueError("command_replayed")
                now = int(time.time() * 1000)
                expired = [key for key, events in self.seen.items()
                           if (events[0].get("occurredAtMs", 0) + MAX_COMMAND_TTL_MS <= now if events
                               else self.seen_started.get(key, now) + MAX_COMMAND_TTL_MS <= now)]
                for key in expired:
                    self.seen.pop(key, None); self.seen_started.pop(key, None)
                    self._command_event_sequences.pop(key, None)
                if len(self.seen) >= 5000: raise ValueError("command_replayed")
                self.seen[command_id] = []
                self.seen_started[command_id] = now
                self._persist_seen()
            self.last_command = command_id
            occurred = int(time.time() * 1000)
            events = [self._event(command_id, "ack", "accepted", sequence, occurred),
                      self._event(command_id, "status", "executing", sequence + 1, occurred)]
            self._command_event_sequences[command_id] = sequence + 1
            self.seen[command_id] = events
            self.seen_started[command_id] = occurred
            self._persist_seen(); self._publish_events(events)
            self._active_telemetry_commands.add(command_id)
            try:
                result = self.on_command_envelope(envelope) if self.on_command_envelope else self.on_command(payload)
                if result is False: raise RuntimeError("runtime_rejected")
                terminal, code = "completed", None
            except Exception as error:
                terminal, code = "failed", str(error)[:80] or "runtime_rejected"
            finally:
                self._active_telemetry_commands.discard(command_id)
                self.safety_controller.release(resource, reason="command_finished")
                lease_acquired = False
            finished = int(time.time() * 1000)
            terminal_sequence = max(sequence + 2, self._command_event_sequences.get(command_id, sequence + 1) + 1)
            events.append(self._event(command_id, "status", terminal, terminal_sequence, finished, code))
            self._command_event_sequences[command_id] = terminal_sequence
            self.seen[command_id] = events
            self.seen_started[command_id] = finished
            self._persist_seen(); self._publish_events([events[-1]])
        except Exception as error:
            if lease_acquired and resource is not None and self.safety_controller is not None:
                try: self.safety_controller.release(resource, reason="command_rejected")
                except Exception: pass
            self.last_error = str(error)[:300]
            if command_id and sequence:
                with self.lock:
                    if command_id in self.seen and not self.seen[command_id]:
                        self.seen.pop(command_id, None); self.seen_started.pop(command_id, None); self._persist_seen()
                self._reject(command_id, sequence, str(error) if str(error) in {"command_invalid", "command_invalid_json", "command_identity_invalid", "command_payload_invalid", "command_expired", "command_replayed", "runtime_rejected", "runtime_not_ready", "hardware_not_commissioned", "hardware_disabled", "hardware_not_authorized", "calibration_required", "estop_latched", "execution_owned_by_another_source", "runtime_fault_latched"} else "command_invalid")

    def _persist_seen(self):
        path = Path(self.dedupe_path); path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd, temp = tempfile.mkstemp(prefix=".iot-dedupe-", dir=path.parent)
        try:
            if hasattr(os, "fchmod"): os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump({k: {"robotId": self.robot_id, "expiresAtMs": int(time.time()*1000)+MAX_COMMAND_TTL_MS, "events": v} for k,v in self.seen.items()}, stream, separators=(",", ":")); stream.flush(); os.fsync(stream.fileno())
            os.replace(temp, path); os.chmod(path, 0o600)
        except Exception:
            try: os.unlink(temp)
            except OSError: pass
            raise

    def _reported(self, connection: str) -> dict[str, Any]:
        # Shadow readiness must be derived from the live runtime. If it cannot
        # be read, do not publish fabricated readiness or stopped state.
        if self.shadow_state is None:
            raise RuntimeError("Runtime Shadow status provider is required.")
        runtime = self.shadow_state()
        required = {"hardwareEnabled", "stopped", "activeRunId", "lastCommandSequence",
                    "adapterMode", "armed", "calibrationReady", "fault"}
        if not isinstance(runtime, dict) or required - runtime.keys():
            raise RuntimeError("Runtime Shadow status is incomplete; refusing to publish readiness.")
        runtime_kind = "MOCK_RUNTIME" if self.runtime_kind == "SIMULATION" else self.runtime_kind
        return {"schemaVersion": 1, "connection": connection, "runtimeKind": runtime_kind,
                **{key: runtime[key] for key in required}, "reportedAtMs": int(time.time()*1000)}

    def _publish_shadow(self, connection: str):
        if self.client and self.connected.is_set():
            try:
                payload = {"state": {"reported": self._reported(connection)}}
            except Exception as error:
                self.last_error = f"Runtime Shadow status unavailable: {error}"[:300]
                return False
            self.client.publish(f"$aws/things/{self.thing_name}/shadow/update", json.dumps(payload, separators=(",", ":")), qos=1, retain=False)
            return True
        return False

    def publish_shadow_state(self) -> bool:
        """Publish a fresh runtime report after a meaningful local state change."""
        return self._publish_shadow("online")

    def publish_status(self, status: dict[str, Any]) -> bool:
        if not self.client or not self.connected.is_set(): return False
        payload = dict(status)
        payload.setdefault("robotId", self.robot_id); payload.setdefault("schemaVersion", 1); payload.setdefault("occurredAtMs", int(time.time()*1000))
        return int(self.client.publish(self.topics["status"], json.dumps(payload, separators=(",", ":")), qos=1, retain=False).rc) == 0

    def publish_telemetry(self, telemetry: dict[str, Any], *, command_id: str) -> bool:
        if not isinstance(telemetry, dict) or len(json.dumps(telemetry).encode()) > MAX_MESSAGE_BYTES: raise ValueError("Telemetry payload is invalid or too large.")
        try: UUID(command_id)
        except (ValueError, TypeError, AttributeError) as error: raise ValueError("Telemetry requires a correlated command UUID.") from error
        if command_id not in self._active_telemetry_commands:
            raise ValueError("Telemetry is accepted only while its command is executing.")
        measured = telemetry.get("measured")
        if (telemetry.get("robot_id") != self.robot_id or telemetry.get("schema_version") != 1
                or telemetry.get("source_mode") != "SIMULATION" or not isinstance(telemetry.get("controller_id"), str)
                or not isinstance(telemetry.get("measured_at"), str) or not telemetry.get("measured_at")
                or isinstance(telemetry.get("sequence"), bool) or not isinstance(telemetry.get("sequence"), int)
                or telemetry.get("connection") not in {"connected", "disconnected"}
                or not isinstance(measured, list) or len(measured) != 6):
            raise ValueError("Telemetry identity, mode or schema is invalid; only validated SIMULATION frames may publish.")
        for row, name in zip(measured, JOINTS, strict=True):
            if (not isinstance(row, dict) or set(row) != {"name", "position", "unit"} or row.get("name") != name
                    or row.get("unit") not in {"deg", "rad"} or isinstance(row.get("position"), bool)
                    or not isinstance(row.get("position"), (int, float)) or not math.isfinite(row["position"])):
                raise ValueError("Telemetry must contain the ordered six-joint SO-101 contract in deg or rad.")
        if telemetry["sequence"] <= self.last_telemetry_sequence: raise ValueError("Telemetry sequence must increase monotonically.")
        if not self.client or not self.connected.is_set(): return False
        now = time.monotonic()
        count = self._telemetry_run_counts.get(command_id, 0)
        last = self._telemetry_run_last_publish.get(command_id)
        if count >= 120 or (last is not None and now - last < 0.5): return False
        last_event_sequence = self._command_event_sequences.get(command_id)
        if last_event_sequence is None:
            raise ValueError("Telemetry requires an active command lifecycle.")
        sequence = last_event_sequence + 1
        event = {"schemaVersion": 1, "kind": "status", "status": "telemetry",
                 "robotId": self.robot_id, "commandId": command_id,
                 "eventId": f"{command_id}:telemetry:{sequence}", "sequence": sequence,
                 "occurredAtMs": int(time.time() * 1000), "telemetry": telemetry}
        published = int(self.client.publish(self.topics["status"], json.dumps(event, separators=(",", ":")), qos=1, retain=False).rc) == 0
        if published:
            self._command_event_sequences[command_id] = sequence
            self.last_telemetry_sequence = telemetry["sequence"]
            self._telemetry_run_counts[command_id] = count + 1
            self._telemetry_run_last_publish[command_id] = now
        return published

    def end_telemetry_run(self, command_id: str) -> None:
        self._telemetry_run_counts.pop(command_id, None)
        self._telemetry_run_last_publish.pop(command_id, None)

    def _schedule_heartbeat(self):
        self._cancel_heartbeat()
        if self.connected.is_set():
            self.heartbeat_timer = threading.Timer(self.heartbeat_interval, self._heartbeat); self.heartbeat_timer.daemon = True; self.heartbeat_timer.start()

    def _heartbeat(self):
        self.heartbeat_timer = None
        if self.connected.is_set():
            self._publish_shadow("online"); self._schedule_heartbeat()

    def _cancel_heartbeat(self):
        timer, self.heartbeat_timer = self.heartbeat_timer, None
        if timer: timer.cancel()

    def disconnect(self):
        client = self.client
        if client and self.connected.is_set():
            try:
                self.publish_status({"connection": "offline", "state": "offline", "hardwareEnabled": False})
                self._publish_shadow("offline")
            except Exception:
                self.last_error = "Could not publish the graceful offline state."
        self.connected.clear(); self._cancel_heartbeat()
        self.client = None
        if client:
            try: client.disconnect()
            finally: client.loop_stop()

    def status(self) -> dict[str, Any]:
        return {"connected": self.connected.is_set(), "thingName": self.thing_name, "robotId": self.robot_id,
                "offlineQueue": False, "dedupePersistent": self.dedupe_healthy, "lastCommandId": self.last_command,
                "lastError": self.last_error}
