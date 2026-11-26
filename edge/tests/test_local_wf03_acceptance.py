"""One-run local WF03 contract acceptance: MQTT fake → Edge/MuJoCo → evidence mock."""
import hashlib
import json
import os
import subprocess
import tempfile
import time
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from edge.runtime import EdgeRuntime

ROBOT = "f1c066c4-b5f2-45c4-b933-f034f3824dd9"
EXPERIMENT = "4dfe1c3a-8c0a-43cc-90c5-15b977e18742"
COMMAND = "a77433c6-0dad-48df-8b54-3a080fc33c60"
PROGRAM_VERSION = "ad404a95-75ce-44e6-86b6-b12651fa2b22"
RUN_ID = f"wf03-{EXPERIMENT}"


class LocalBrokerClient:
    def __init__(self): self.published, self.subscriptions = [], []
    def will_set(self, *args, **kwargs): self.will = (args, kwargs)
    def connect(self, _host, _port, keepalive): self.on_connect(self, None, None, 0, None)
    def loop_start(self): pass
    def loop_stop(self): pass
    def disconnect(self): pass
    def subscribe(self, topic, qos): self.subscriptions.append((topic, qos)); return (0, 1)
    def publish(self, topic, payload, qos, retain):
        self.published.append((topic, json.loads(payload), qos, retain))
        return types.SimpleNamespace(rc=0)


class MockEvidenceEndpoint:
    def __init__(self): self.stored = []
    def post(self, body):
        manifest = body["manifest"]
        if (manifest.get("schema") != "vista.robot.recording.v1"
                or body["sha256"] != body["expectedSha256"]
                or manifest.get("status") != "LOCAL_RECORDED"):
            raise ValueError("mock evidence contract rejected artifact")
        row = {"evidenceId": "local-evidence-001", "status": "PROCESSING",
               "experimentId": manifest["experimentId"], "episodeId": manifest["episodeId"],
               "robotId": manifest["robotId"], "commandId": body["commandId"]}
        self.stored.append(row)
        return 201, row


class LocalWF03Acceptance(unittest.TestCase):
    def test_single_run_command_to_mock_evidence_contract(self):
        client = LocalBrokerClient()
        def authorize(envelope):
            return (envelope.get("payload", {}).get("runId") == RUN_ID
                    and envelope.get("payload", {}).get("robotId") == ROBOT
                    and envelope.get("robotId") == ROBOT)

        runtime = EdgeRuntime(mqtt_authorizer=authorize,
                              allow_local_mqtt_test=True,
                              mqtt_transport_factory=lambda **kw: __import__("edge.mqtt_transport", fromlist=["MqttTransport"]).MqttTransport(
                                  **kw, client_factory=lambda: client))
        with tempfile.TemporaryDirectory(prefix="vista-wf03-") as tmp:
            config = {"host": "localhost", "thingName": "vista-local-wf03", "robotId": ROBOT,
                      "caFile": "mock-ca", "certFile": "mock-cert", "keyFile": "mock-key",
                      "dedupePath": str(Path(tmp) / "dedupe.json"), "topicPrefix": "vista/local/robots",
                      "runtimeKind": "SIMULATION"}
            self.assertTrue(runtime.handle({"id": "init", "method": "mqtt_initialize", "params": config})["initialized"])
            with patch.dict(os.environ, {}, clear=False):
                os.environ.pop("VISTA_IOT_ENABLED", None)
                connected = runtime.handle({"id": "connect", "method": "mqtt_connect"})
            self.assertTrue(connected["connected"])
            reported = [p[1]["state"]["reported"] for p in client.published if p[0].endswith("/shadow/update")]
            self.assertTrue(reported)
            self.assertTrue(all(entry["runtimeKind"] == "MOCK_RUNTIME" for entry in reported))
            envelope = {"schemaVersion": 1, "kind": "run", "commandId": COMMAND, "robotId": ROBOT,
                "sequence": int(time.time() * 1000), "issuedAtMs": int(time.time() * 1000),
                "expiresAtMs": int(time.time() * 1000) + 10000,
                "payload": {"runId": RUN_ID, "robotId": ROBOT, "programVersionId": PROGRAM_VERSION, "profile": "lesson",
                            "program": {"kind": "robot_program", "schemaVersion": 1,
                                        "steps": [{"type": "arm.select", "arm": "right"}, {"type": "home", "arm": "right"}]}}}
            msg = types.SimpleNamespace(topic=runtime.mqtt_transport.topics["commands"],
                                         payload=json.dumps(envelope).encode(), retain=False)
            runtime.safety.acquire("local-so101-simulation", "blockly", runtime_kind="SIMULATION",
                robot_id="local-so101-simulation", calibrated=True, device_role="follower")
            client.on_message(client, None, msg)
            self.assertEqual(runtime.safety.status()["owners"]["local-so101-simulation"]["source"], "blockly")
            rejected = [p[1] for p in client.published if p[1].get("commandId") == COMMAND]
            self.assertEqual((rejected[-1]["status"], rejected[-1]["code"]), ("rejected", "execution_owned_by_another_source"))
            runtime.safety.release("local-so101-simulation", reason="test_complete")
            client.on_message(client, None, msg)
            lifecycle = [p[1] for p in client.published if p[1].get("commandId") == COMMAND and p[1].get("status") != "telemetry"]
            self.assertEqual([e["status"] for e in lifecycle], ["rejected", "accepted", "executing", "completed"], lifecycle[-1])
            self.assertTrue(all(e["robotId"] == ROBOT for e in lifecycle))
            self.assertEqual(runtime.safety.status()["owners"], {})
            telemetry_events = [p[1] for p in client.published if p[0] == runtime.mqtt_transport.topics["status"] and p[1].get("status") == "telemetry"]
            self.assertTrue(telemetry_events)
            self.assertEqual(telemetry_events[-1]["robotId"], ROBOT)
            self.assertEqual(telemetry_events[-1]["commandId"], COMMAND)
            self.assertEqual(telemetry_events[-1]["telemetry"]["robot_id"], ROBOT)
            self.assertLess(client.published.index(next(p for p in client.published if p[1].get("status") == "telemetry")),
                            max(i for i, p in enumerate(client.published) if p[1].get("status") == "completed"))
            telemetry = telemetry_events[-1]["telemetry"]

            # Reuse Desktop's actual Node RecordingManager and manifest writer.
            js = r'''const {RecordingManager}=require('./recording-manager');
const root=process.argv[1], frame=JSON.parse(process.argv[2]);
const manager=new RecordingManager(root);
const episode=manager.start({experimentId:process.argv[3],robotId:process.argv[4],slot:'simulation',deviceId:'local-mujoco',runtimeKind:'SIMULATION'});
const joints=Object.fromEntries(frame.measured.map((j)=>[j.name,j.position]));
manager.append({measured:true,unit:'rad',timestamp:Date.now()/1000,joints});
const stopped=manager.stop();
process.stdout.write(JSON.stringify({episodeId:episode.episodeId,manifest:manager.get(episode.episodeId).manifest,sha256:stopped.sha256,artifact:require('node:fs').readFileSync(manager.directory(episode.episodeId)+'/trajectory.ndjson','utf8')}));'''
            completed = subprocess.run(["node", "-e", js, str(Path(tmp) / "recordings"),
                json.dumps(telemetry), EXPERIMENT, ROBOT], check=True, capture_output=True, text=True)
            recorded = json.loads(completed.stdout)
            self.assertEqual(recorded["manifest"]["experimentId"], EXPERIMENT)
            self.assertEqual(recorded["manifest"]["robotId"], ROBOT)
            self.assertEqual(recorded["manifest"]["schema"], "vista.robot.recording.v1")
            artifact_hash = hashlib.sha256(recorded["artifact"].encode()).hexdigest()
            self.assertEqual(recorded["sha256"], artifact_hash)

            upload_endpoint = MockEvidenceEndpoint()
            status_code, result = upload_endpoint.post({"manifest": recorded["manifest"],
                "sha256": artifact_hash, "expectedSha256": recorded["sha256"], "commandId": COMMAND})
            self.assertEqual(status_code, 201)
            self.assertEqual(result["status"], "PROCESSING")
            self.assertEqual((result["experimentId"], result["robotId"], result["commandId"]), (EXPERIMENT, ROBOT, COMMAND))
            self.assertEqual(result["episodeId"], recorded["episodeId"])
            self.assertEqual(upload_endpoint.stored, [result])
            runtime.handle({"id": "disconnect", "method": "mqtt_disconnect"})
            self.assertFalse(runtime.mqtt_status()["connected"])
            runtime.close()


if __name__ == "__main__": unittest.main()
