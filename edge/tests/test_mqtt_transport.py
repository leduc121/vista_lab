import json
import os
import tempfile
import time
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from edge.mqtt_transport import MqttTransport


class FakeClient:
    def __init__(self, **kwargs):
        self.options = kwargs
        self.published = []
        self.subscriptions = []
        self.tls = {}

    def tls_set(self, **kwargs): self.tls = kwargs
    def tls_insecure_set(self, value): self.insecure = value
    def reconnect_delay_set(self, **kwargs): self.reconnect = kwargs
    def connect(self, host, port, keepalive): self.on_connect(self, None, None, 0, None)
    def loop_start(self): pass
    def loop_stop(self): pass
    def subscribe(self, topic, qos): self.subscriptions.append((topic, qos)); return (0, 1)
    def publish(self, topic, payload, qos, retain): self.published.append((topic, json.loads(payload), qos, retain)); return types.SimpleNamespace(rc=0)
    def disconnect(self): pass


class MqttTransportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.paths = [Path(self.temp.name) / name for name in ("ca.pem", "device.crt", "device.key")]
        for path in self.paths:
            path.write_text("test-only placeholder", encoding="utf-8")
            os.chmod(path, 0o600)
        self.executed = []
        self.dedupe_path = Path(self.temp.name) / "mqtt-dedupe.json"
        self.transport = MqttTransport(host="example-ats.iot.test", device_id="lab-01",
                                       ca_file=str(self.paths[0]), cert_file=str(self.paths[1]), key_file=str(self.paths[2]),
                                       dedupe_path=str(self.dedupe_path),
                                       authorize=lambda envelope: envelope.get("authorized") is True,
                                       on_command=lambda envelope: self.executed.append(envelope["commandId"]) or {"result": "test"},
                                       client_factory=FakeClient)
        self.mqtt_module = types.SimpleNamespace(CallbackAPIVersion=types.SimpleNamespace(VERSION2=2), MQTTv311=4)
        self.modules = {"paho": types.ModuleType("paho"), "paho.mqtt": types.ModuleType("paho.mqtt"), "paho.mqtt.client": self.mqtt_module}

    @staticmethod
    def command_steps(action="home"):
        steps = [{"type": "arm.select", "arm": "left"}]
        steps.append({"type": action, **({"arm": "left"} if action == "home" else {})})
        return steps

    def tearDown(self):
        self.transport.disconnect()
        self.temp.cleanup()

    def test_tls_connection_and_authorized_command_ack(self):
        with patch.dict("sys.modules", self.modules):
            state = self.transport.connect()
        self.assertTrue(state["connected"])
        self.assertFalse(self.transport.client.insecure)
        self.assertEqual(self.transport.client.tls["cert_reqs"], 2)
        self.assertEqual(self.transport.client.subscriptions, [("vista/devices/lab-01/commands", 1)])
        self.assertIsNotNone(self.transport.heartbeat_timer)
        now = int(time.time() * 1000)
        envelope = {"commandId": "command01", "issuedAt": now, "expiresAt": now + 30_000, "authorized": True,
                    "command": {"id": "command01", "expiresAt": now + 30_000, "steps": self.command_steps("gripper.open")}}
        message = types.SimpleNamespace(topic="vista/devices/lab-01/commands", payload=json.dumps(envelope).encode("utf-8"))
        self.transport._on_message(self.transport.client, None, message)
        self.assertEqual(self.executed, ["command01"])
        self.assertEqual(self.transport.client.published[-1][1]["status"], "accepted")
        self.assertEqual(self.transport.publish_telemetry({"status": "ok"}), True)

    def test_expired_duplicate_and_unauthorized_commands_never_reach_handler(self):
        with patch.dict("sys.modules", self.modules):
            self.transport.connect()
        now = int(time.time() * 1000)
        expired = {"commandId": "expired1", "issuedAt": now - 90_000, "expiresAt": now - 1, "authorized": True,
                   "command": {"id": "expired1", "expiresAt": now - 1, "steps": self.command_steps()}}
        self.transport._on_message(self.transport.client, None, types.SimpleNamespace(topic="vista/devices/lab-01/commands", payload=json.dumps(expired).encode()))
        denied = {"commandId": "denied001", "issuedAt": now, "expiresAt": now + 30_000, "authorized": False,
                  "command": {"id": "denied001", "expiresAt": now + 30_000, "steps": self.command_steps()}}
        message = types.SimpleNamespace(topic="vista/devices/lab-01/commands", payload=json.dumps(denied).encode())
        self.transport._on_message(self.transport.client, None, message)
        self.transport._on_message(self.transport.client, None, message)
        self.assertEqual(self.executed, [])
        self.assertEqual([row[1]["status"] for row in self.transport.client.published], ["rejected", "rejected", "rejected"])

    def test_duplicate_rejected_after_process_restart(self):
        with patch.dict("sys.modules", self.modules):
            self.transport.connect()
        now = int(time.time() * 1000)
        envelope = {"commandId": "persisted1", "issuedAt": now, "expiresAt": now + 30_000, "authorized": True,
                    "command": {"id": "persisted1", "expiresAt": now + 30_000, "steps": self.command_steps()}}
        message = types.SimpleNamespace(topic="vista/devices/lab-01/commands", payload=json.dumps(envelope).encode())
        self.transport._on_message(self.transport.client, None, message)
        restarted = MqttTransport(host="example-ats.iot.test", device_id="lab-01",
                                  ca_file=str(self.paths[0]), cert_file=str(self.paths[1]), key_file=str(self.paths[2]),
                                  dedupe_path=str(self.dedupe_path), authorize=lambda _: True,
                                  on_command=lambda _: self.fail("replayed command reached handler"), client_factory=FakeClient)
        with patch.dict("sys.modules", self.modules):
            restarted.connect()
        restarted._on_message(restarted.client, None, message)
        self.assertEqual(restarted.client.published[-1][1]["status"], "rejected")
        self.assertTrue(restarted.status()["dedupePersistent"])
        restarted.disconnect()

    def test_retained_commands_are_never_executed(self):
        with patch.dict("sys.modules", self.modules):
            self.transport.connect()
        now = int(time.time() * 1000)
        retained = {"commandId": "retained1", "issuedAt": now, "expiresAt": now + 30_000, "authorized": True,
                    "command": {"id": "retained1", "expiresAt": now + 30_000, "steps": self.command_steps()}}
        message = types.SimpleNamespace(topic="vista/devices/lab-01/commands", retain=True, payload=json.dumps(retained).encode())
        self.transport._on_message(self.transport.client, None, message)
        self.assertEqual(self.executed, [])
        self.assertEqual(self.transport.client.published[-1][1]["status"], "rejected")

    def test_servo_and_joint_setpoint_payloads_are_rejected(self):
        with patch.dict("sys.modules", self.modules):
            self.transport.connect()
        now = int(time.time() * 1000)
        command = {"commandId": "servocmd1", "issuedAt": now, "expiresAt": now + 30_000,
                   "authorized": True, "command": {"id": "servocmd1", "expiresAt": now + 30_000,
                   "steps": self.command_steps()}, "joint_setpoints": [0, 1, 2]}
        message = types.SimpleNamespace(topic="vista/devices/lab-01/commands", payload=json.dumps(command).encode())
        self.transport._on_message(self.transport.client, None, message)
        self.assertEqual(self.executed, [])
        self.assertEqual(self.transport.client.published[-1][1]["status"], "rejected")

    def test_private_key_permissions_fail_closed(self):
        os.chmod(self.paths[2], 0o644)
        with patch.dict("sys.modules", self.modules):
            with self.assertRaises(PermissionError):
                self.transport.connect()


if __name__ == "__main__":
    unittest.main()
