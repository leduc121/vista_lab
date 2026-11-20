"""AWS IoT compatible MQTT transport. Never use this channel for servo control."""
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

DEVICE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
MAX_MESSAGE_BYTES = 64 * 1024
MAX_TTL_SECONDS = 24 * 60 * 60
FORBIDDEN_REALTIME_FIELDS = {"servo", "servos", "joints", "jointpositions", "jointsetpoints", "trajectory", "teleop", "velocity", "torque", "current", "motorcommands", "goalposition", "setpoint"}
ALLOWED_STEPS = {"arm.select", "home", "preview.move_xyz", "gripper.open", "gripper.close", "wait"}


def _reason_value(reason_code: Any) -> int:
    value = getattr(reason_code, "value", reason_code)
    try:
        return int(value)
    except (TypeError, ValueError):
        return 1


def _contains_realtime_control(value: Any) -> bool:
    if isinstance(value, dict):
        return any(str(key).replace("_", "").lower() in FORBIDDEN_REALTIME_FIELDS
                   or str(key).replace("_", "").lower().startswith(("joint", "servo", "motor", "trajectory", "teleop"))
                   or _contains_realtime_control(item)
                   for key, item in value.items())
    if isinstance(value, list):
        return any(_contains_realtime_control(item) for item in value)
    return False


class MqttTransport:
    def __init__(self, *, host: str, device_id: str, ca_file: str, cert_file: str, key_file: str,
                 authorize: Callable[[dict[str, Any]], bool], on_command: Callable[[dict[str, Any]], dict[str, Any]],
                 dedupe_path: str, client_factory: Callable[..., Any] | None = None, port: int = 8883,
                 heartbeat_interval: float = 30.0) -> None:
        if not isinstance(host, str) or not host or len(host) > 253 or any(c in host for c in "/@ "):
            raise ValueError("A valid AWS IoT endpoint hostname is required.")
        if not DEVICE_ID.fullmatch(device_id):
            raise ValueError("Device ID format is invalid.")
        if not 1 <= port <= 65535:
            raise ValueError("MQTT port is invalid.")
        if not 5 <= heartbeat_interval <= 300:
            raise ValueError("Heartbeat interval must be between 5 and 300 seconds.")
        self.host, self.port, self.device_id = host, port, device_id
        self.ca_file, self.cert_file, self.key_file = map(str, (ca_file, cert_file, key_file))
        self.dedupe_path = str(dedupe_path)
        self.heartbeat_interval = heartbeat_interval
        self.authorize, self.on_command = authorize, on_command
        self.client_factory = client_factory
        self.client = None
        self.connected = threading.Event()
        self.heartbeat_timer: threading.Timer | None = None
        self.last_error: str | None = None
        self.seen: OrderedDict[str, float] = OrderedDict()
        self.lock = threading.Lock()
        self.dedupe_healthy = True
        try:
            stored = json.loads(Path(self.dedupe_path).read_text(encoding="utf-8"))
            if not isinstance(stored, dict):
                raise ValueError("dedupe state is not an object")
            self.seen.update((key, float(expiry)) for key, expiry in stored.items()
                             if isinstance(key, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,96}", key)
                             and isinstance(expiry, (int, float)) and float(expiry) > time.time())
        except FileNotFoundError:
            pass
        except Exception as error:
            self.last_error = f"Persistent MQTT dedupe state is invalid: {error}"
            self.dedupe_healthy = False
        else:
            self.dedupe_healthy = True

    def _check_identity_files(self) -> None:
        for filename in (self.ca_file, self.cert_file, self.key_file):
            if not Path(filename).is_file():
                raise RuntimeError("Provisioned CA/certificate/key files are incomplete.")
        mode = os.stat(self.key_file).st_mode & 0o777
        if mode & 0o077:
            raise PermissionError("Device private key file must be restricted to its owner (0600).")

    def connect(self, timeout: float = 8.0) -> dict[str, Any]:
        self._check_identity_files()
        if not self.dedupe_healthy:
            raise RuntimeError(self.last_error or "Persistent MQTT dedupe state is unavailable.")
        if self.client is not None:
            raise RuntimeError("MQTT transport is already initialized.")
        try:
            import paho.mqtt.client as mqtt
        except ImportError as error:
            raise RuntimeError("paho-mqtt is unavailable in this Edge Runtime.") from error
        factory = self.client_factory or mqtt.Client
        client = factory(callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                         client_id=self.device_id, protocol=mqtt.MQTTv311, clean_session=True)
        client.tls_set(ca_certs=self.ca_file, certfile=self.cert_file, keyfile=self.key_file,
                       cert_reqs=ssl.CERT_REQUIRED, tls_version=ssl.PROTOCOL_TLS_CLIENT)
        client.tls_insecure_set(False)
        client.reconnect_delay_set(min_delay=1, max_delay=30)
        client.on_connect = self._on_connect
        client.on_disconnect = self._on_disconnect
        client.on_message = self._on_message
        self.client = client
        client.connect(self.host, self.port, keepalive=30)
        client.loop_start()
        if not self.connected.wait(max(0.1, min(timeout, 30.0))):
            self.disconnect()
            raise TimeoutError("MQTT TLS connection did not become ready before timeout.")
        return {"connected": True, "host": self.host, "port": self.port, "deviceId": self.device_id}

    def _on_connect(self, client: Any, userdata: Any, flags: Any, reason_code: Any, properties: Any = None) -> None:
        if _reason_value(reason_code) != 0:
            self.last_error = f"MQTT broker rejected connection ({reason_code})."
            self.connected.clear()
            return
        topic = f"vista/devices/{self.device_id}/commands"
        result, _mid = client.subscribe(topic, qos=1)
        if result != 0:
            self.last_error = "MQTT command subscription failed."
            self.connected.clear()
            return
        self.last_error = None
        self.connected.set()
        self._schedule_heartbeat()

    def _on_disconnect(self, client: Any, userdata: Any, disconnect_flags: Any, reason_code: Any, properties: Any = None) -> None:
        self.connected.clear()
        self._cancel_heartbeat()
        if _reason_value(reason_code) != 0:
            self.last_error = "MQTT connection lost; offline commands are not queued."

    def _ack(self, command_id: str, status: str, message: str = "") -> None:
        if not self.client or not self.connected.is_set():
            return
        topic = f"vista/devices/{self.device_id}/results"
        payload = json.dumps({"commandId": command_id, "status": status, "message": message[:300], "timestamp": int(time.time() * 1000)}, separators=(",", ":"))
        self.client.publish(topic, payload, qos=1, retain=False)

    def _on_message(self, client: Any, userdata: Any, message: Any) -> None:
        command_id = ""
        try:
            if message.topic != f"vista/devices/{self.device_id}/commands":
                raise PermissionError("Command arrived on an unexpected MQTT topic.")
            if len(message.payload) > MAX_MESSAGE_BYTES:
                raise ValueError("Command payload exceeds the size limit.")
            envelope = json.loads(message.payload.decode("utf-8"))
            if not isinstance(envelope, dict):
                raise ValueError("Command envelope must be an object.")
            command_id = envelope.get("commandId", "")
            if getattr(message, "retain", False):
                raise PermissionError("Retained commands are rejected to prevent replay after reconnect.")
            if not isinstance(command_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", command_id):
                raise ValueError("Command ID is invalid.")
            command = envelope.get("command")
            self._validate_lab_command(command, command_id, envelope.get("expiresAt"))
            if _contains_realtime_control(envelope):
                raise PermissionError("MQTT cannot carry servo, joint-setpoint, trajectory, or teleoperation commands.")
            now_ms = int(time.time() * 1000)
            issued, expires = envelope.get("issuedAt"), envelope.get("expiresAt")
            if not isinstance(issued, int) or isinstance(issued, bool) or not isinstance(expires, int) or isinstance(expires, bool) or issued > now_ms + 30_000 or expires <= now_ms or expires - issued > MAX_TTL_SECONDS * 1000:
                raise ValueError("Command is expired or has an invalid time window.")
            with self.lock:
                for key, expiry in list(self.seen.items()):
                    if expiry <= time.time():
                        self.seen.pop(key, None)
                if command_id in self.seen:
                    raise ValueError("Duplicate command rejected.")
                if len(self.seen) >= 5000:
                    raise RuntimeError("Persistent dedupe capacity is full; command rejected safely.")
                if not self.authorize(envelope):
                    raise PermissionError("Command authorization failed.")
                self.seen[command_id] = expires / 1000
                self._persist_seen()
            result = self.on_command(envelope)
            self._ack(command_id, "accepted", json.dumps(result, separators=(",", ":"))[:300])
        except Exception as error:
            self.last_error = str(error)[:300]
            if command_id:
                self._ack(command_id, "rejected", self.last_error)

    def publish_telemetry(self, telemetry: dict[str, Any]) -> bool:
        if not isinstance(telemetry, dict) or len(json.dumps(telemetry).encode("utf-8")) > MAX_MESSAGE_BYTES:
            raise ValueError("Telemetry payload is invalid or too large.")
        if not self.client or not self.connected.is_set():
            return False
        result = self.client.publish(f"vista/devices/{self.device_id}/telemetry", json.dumps(telemetry, separators=(",", ":")), qos=0, retain=False)
        return int(result.rc) == 0

    def _schedule_heartbeat(self) -> None:
        self._cancel_heartbeat()
        if not self.connected.is_set():
            return
        timer = threading.Timer(self.heartbeat_interval, self._heartbeat)
        timer.daemon = True
        self.heartbeat_timer = timer
        timer.start()

    def _heartbeat(self) -> None:
        self.heartbeat_timer = None
        if not self.connected.is_set():
            return
        accepted = self.publish_telemetry({"type": "heartbeat", "deviceId": self.device_id,
                                           "timestamp": int(time.time() * 1000)})
        if not accepted:
            self.last_error = "Heartbeat publish failed; no telemetry was queued offline."
        self._schedule_heartbeat()

    def _cancel_heartbeat(self) -> None:
        timer, self.heartbeat_timer = self.heartbeat_timer, None
        if timer:
            timer.cancel()

    @staticmethod
    def _validate_lab_command(command: Any, command_id: str, expires_at: Any) -> None:
        now_ms = int(time.time() * 1000)
        if not isinstance(command, dict) or command.get("id") != command_id or command.get("expiresAt") != expires_at:
            raise ValueError("Command envelope and command payload do not match.")
        if not isinstance(expires_at, int) or isinstance(expires_at, bool) or expires_at <= now_ms or expires_at > now_ms + 30_000:
            raise ValueError("Lab command expiry exceeds the local command age limit.")
        steps = command.get("steps")
        if not isinstance(steps, list) or not 1 <= len(steps) <= 200:
            raise ValueError("Lab command must contain 1 to 200 allowed steps.")
        wait_total = 0
        selected_arm = None
        for step in steps:
            if not isinstance(step, dict) or step.get("type") not in ALLOWED_STEPS:
                raise ValueError("Lab command step is not supported.")
            fields = {
                "arm.select": {"type", "arm"}, "home": {"type", "arm"},
                "preview.move_xyz": {"type", "mode", "frame", "arm", "position"},
                "gripper.open": {"type", "arm"}, "gripper.close": {"type", "arm"}, "wait": {"type", "durationMs"}
            }[step["type"]]
            if set(step) - fields:
                raise ValueError("Lab command step contains unsupported fields.")
            if step["type"] == "arm.select" and step.get("arm") not in {"left", "right"}:
                raise ValueError("Arm selection is invalid.")
            if step["type"] == "arm.select":
                selected_arm = step["arm"]
            if step["type"] in {"home", "gripper.open", "gripper.close"} and step.get("arm") not in {None, "left", "right"}:
                raise ValueError("Arm selection is invalid.")
            if step["type"] in {"home", "preview.move_xyz", "gripper.open", "gripper.close"}:
                if selected_arm is None:
                    raise ValueError("Select an arm before movement or gripper commands.")
                if step.get("arm") is not None and step.get("arm") != selected_arm:
                    raise ValueError("Command arm does not match the selected arm.")
            if step["type"] == "preview.move_xyz":
                point = step.get("position")
                if step.get("mode") != "learning_preview" or step.get("frame") != "learning_preview_v1":
                    raise ValueError("XYZ movement must use the learning preview frame.")
                if not isinstance(point, dict) or set(point) != {"x", "y", "z"}:
                    raise ValueError("XYZ movement must contain x, y and z only.")
                bounds = {"x": (0, 600), "y": (0, 400), "z": (10, 300)}
                for axis, (low, high) in bounds.items():
                    value = point[axis]
                    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
                        raise ValueError(f"XYZ movement {axis} is outside the learning-preview bounds.")
            if step["type"] == "wait":
                duration = step.get("durationMs")
                if not isinstance(duration, int) or isinstance(duration, bool) or not 0 <= duration <= 5000:
                    raise ValueError("Wait duration is invalid.")
                wait_total += duration
        if wait_total > 15_000:
            raise ValueError("Lab command wait budget exceeded.")

    def _persist_seen(self) -> None:
        destination = Path(self.dedupe_path)
        destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd, temporary = tempfile.mkstemp(prefix=".mqtt-dedupe-", dir=destination.parent)
        try:
            if hasattr(os, "fchmod"):
                os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(self.seen, stream, separators=(",", ":"))
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, destination)
            os.chmod(destination, 0o600)
        except Exception:
            try: os.unlink(temporary)
            except OSError: pass
            raise

    def disconnect(self) -> None:
        client, self.client = self.client, None
        self.connected.clear()
        self._cancel_heartbeat()
        if client:
            try:
                client.disconnect()
            finally:
                client.loop_stop()

    def status(self) -> dict[str, Any]:
        return {"connected": self.connected.is_set(), "deviceId": self.device_id,
                "offlineQueue": False, "dedupePersistent": self.dedupe_healthy,
                "lastError": self.last_error}
