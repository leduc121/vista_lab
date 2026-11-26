import json, os, tempfile, time, types, unittest
from pathlib import Path
from unittest.mock import patch
from edge.mqtt_transport import MqttTransport
from edge.safety_controller import LocalSafetyController

ROBOT = "f1c066c4-b5f2-45c4-b933-f034f3824dd9"
THING = "vista-demo-" + ROBOT
CMD = "7b2f9c1e-0d34-4c6a-8e51-2a9b6d4c7f03"

class FakeClient:
    def __init__(self, **kwargs): self.options=kwargs; self.published=[]; self.subscriptions=[]
    def tls_set(self, **kwargs): self.tls=kwargs
    def tls_insecure_set(self, value): self.insecure=value
    def reconnect_delay_set(self, **kwargs): self.reconnect=kwargs
    def will_set(self, *args, **kwargs): self.will=(args,kwargs)
    def connect(self, host, port, keepalive): self.on_connect(self,None,None,0,None)
    def loop_start(self): pass
    def loop_stop(self): pass
    def subscribe(self, topic, qos): self.subscriptions.append((topic,qos)); return (0,1)
    def publish(self, topic, payload, qos, retain): self.published.append((topic,json.loads(payload),qos,retain)); return types.SimpleNamespace(rc=0)
    def disconnect(self): pass

class TestSafetyGate:
    def __init__(self, ready=True): self.ready=ready; self.acquired=[]; self.released=[]
    def mqtt_ready(self): return self.ready
    def acquire(self, resource, source, **kwargs): self.acquired.append((resource,source,kwargs))
    def release(self, resource, **kwargs): self.released.append((resource,kwargs))

class MqttTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.paths=[Path(self.temp.name)/n for n in ("ca.pem","device.crt","device.key")]
        for p in self.paths: p.write_text("test fixture"); os.chmod(p,0o600)
        self.called=[]
        self.safety=TestSafetyGate()
        self.shadow = {"hardwareEnabled": False, "stopped": True, "activeRunId": None,
            "lastCommandSequence": 0, "adapterMode": "so101_follower", "armed": False,
            "calibrationReady": False, "fault": None}
        self.transport=MqttTransport(host="example-ats.iot.test",thing_name=THING,robot_id=ROBOT,
            ca_file=str(self.paths[0]),cert_file=str(self.paths[1]),key_file=str(self.paths[2]),
            authorize=lambda _: True,safety_ready=lambda: True,safety_controller=self.safety,on_command=lambda p:self.called.append(p["runId"]),
            dedupe_path=str(Path(self.temp.name)/"seen.json"),client_factory=FakeClient,
            shadow_state=lambda: dict(self.shadow))
        self.module=types.SimpleNamespace(CallbackAPIVersion=types.SimpleNamespace(VERSION2=2),MQTTv311=4)
        self.modules={"paho":types.ModuleType("paho"),"paho.mqtt":types.ModuleType("paho.mqtt"),"paho.mqtt.client":self.module}
    def tearDown(self): self.transport.disconnect(); self.temp.cleanup()
    def envelope(self, seq=1700000000000):
        now=int(time.time()*1000)
        return {"schemaVersion":1,"kind":"run","commandId":CMD,"robotId":ROBOT,"sequence":seq,
          "issuedAtMs":now,"expiresAtMs":now+10000,"payload":{"runId":"run-1","robotId":ROBOT,"programVersionId":"version-1","profile":"lesson",
          "program":{"kind":"robot_program","schemaVersion":1,"steps":[{"type":"arm.select","arm":"left"},{"type":"home","arm":"left"}]}}}
    def connect(self):
        with patch.dict("sys.modules",self.modules), patch.dict(os.environ,{"VISTA_IOT_ENABLED":"true"}): return self.transport.connect()
    @unittest.skipIf(os.name=="nt","Windows key ACL validation is fail closed")
    def test_contract_topics_mtls_shadow_and_lifecycle_match_fixture(self):
        self.connect(); c=self.transport.client
        self.assertEqual(c.options["client_id"],THING); self.assertFalse(c.insecure)
        self.assertEqual(c.subscriptions,[(f"vista/demo/robots/{ROBOT}/commands",1)])
        self.assertEqual(c.tls["tls_version"],__import__("ssl").PROTOCOL_TLSv1_2)
        self.assertEqual(c.will[1]["qos"],1)
        self.assertEqual(c.published[0][0],f"$aws/things/{THING}/shadow/update")
        self.assertEqual(c.published[0][1]["state"]["reported"]["runtimeKind"], "PHYSICAL_ROBOT")
        envelope=self.envelope(); msg=types.SimpleNamespace(topic=self.transport.topics["commands"],payload=json.dumps(envelope).encode(),retain=False)
        self.transport._on_message(c,None,msg)
        self.assertEqual(self.called,["run-1"])
        self.assertEqual(self.safety.acquired[0][1],"MQTT")
        self.assertEqual(len(self.safety.released),1)
        events=[p[1] for p in c.published if p[1].get("commandId")==CMD]
        self.assertEqual([e["eventId"] for e in events],[f"{CMD}:ack:accepted",f"{CMD}:status:executing",f"{CMD}:status:completed"])
        self.assertEqual([e["sequence"] for e in events],[envelope["sequence"],envelope["sequence"]+1,envelope["sequence"]+2])
        self.assertTrue(all(e["robotId"]==ROBOT and e["occurredAtMs"] for e in events))
        telemetry={"schema_version":1,"robot_id":ROBOT,"source_mode":"SIMULATION","controller_id":"mock","measured_at":"2026-11-25T00:00:00Z","sequence":1,"connection":"connected","measured":[{"name":name,"position":0.0,"unit":"rad"} for name in ("shoulder_pan","shoulder_lift","elbow_flex","wrist_flex","wrist_roll","gripper")]}
        self.assertTrue(self.transport.publish_telemetry(telemetry))
        with self.assertRaises(ValueError): self.transport.publish_telemetry({**telemetry,"source_mode":"LIVE_PHYSICAL"})

    def test_shadow_uses_current_runtime_truth_and_simulation_provenance(self):
        self.transport.runtime_kind = "SIMULATION"
        self.shadow.update({"hardwareEnabled": False, "stopped": False, "activeRunId": "run-1",
            "lastCommandSequence": 8, "adapterMode": "mujoco", "armed": True,
            "calibrationReady": True, "fault": None})
        reported = self.transport._reported("online")
        self.assertEqual(reported["runtimeKind"], "MOCK_RUNTIME")
        self.assertEqual(reported["adapterMode"], "mujoco")
        self.assertFalse(reported["hardwareEnabled"])
        self.assertFalse(reported["stopped"])
        self.assertEqual(reported["activeRunId"], "run-1")
        self.assertEqual(reported["lastCommandSequence"], 8)
        self.assertTrue(reported["armed"])
        self.assertTrue(reported["calibrationReady"])

    def test_shadow_refuses_missing_runtime_status_provider(self):
        self.transport.shadow_state = None
        with self.assertRaisesRegex(RuntimeError, "provider is required"):
            self.transport._reported("online")
    @unittest.skipIf(os.name=="nt","Windows key ACL validation is fail closed")
    def test_duplicate_republishes_deterministic_events_without_second_execution(self):
        self.connect(); msg=types.SimpleNamespace(topic=self.transport.topics["commands"],payload=json.dumps(self.envelope()).encode(),retain=False)
        self.transport._on_message(self.transport.client,None,msg); before=len(self.called)
        self.transport._on_message(self.transport.client,None,msg)
        self.assertEqual(len(self.called),before)
        self.assertEqual(self.transport.client.published[-3][1]["eventId"],f"{CMD}:ack:accepted")
    @unittest.skipIf(os.name=="nt","Windows key ACL validation is fail closed")
    def test_expired_unauthorized_and_safety_blocked_commands_rejected(self):
        self.connect(); cases=[]
        expired=self.envelope(); expired["expiresAtMs"]=int(time.time()*1000)-1; cases.append(expired)
        denied=self.envelope(); denied["commandId"]="0b4bb0f5-1e6e-4c41-aef6-3d5f78036d9e"; self.transport.authorize=lambda _:False; cases.append(denied)
        for e in cases: self.transport._on_message(self.transport.client,None,types.SimpleNamespace(topic=self.transport.topics["commands"],payload=json.dumps(e).encode(),retain=False))
        self.assertEqual(self.called,[])
        self.assertEqual([x[1]["status"] for x in self.transport.client.published if x[1].get("kind")=="ack"],["rejected","rejected"])
    def test_transport_requires_explicit_opt_in_and_correct_identity(self):
        with patch.dict(os.environ,{},clear=True), patch.dict("sys.modules",self.modules):
            with self.assertRaises(PermissionError): self.transport.connect()
        self.transport.safety_controller=None
        with patch.dict(os.environ,{"VISTA_IOT_ENABLED":"true"}), patch.dict("sys.modules",self.modules):
            with self.assertRaisesRegex(PermissionError,"LocalSafetyController"):
                self.transport.connect()
        with self.assertRaises(ValueError): MqttTransport(host="a",thing_name=THING,robot_id=THING,ca_file="",cert_file="",key_file="",authorize=lambda _:True,safety_ready=lambda:True,on_command=lambda _:None,dedupe_path="x")

    def test_heartbeat_cannot_exceed_backend_freshness_interval(self):
        self.assertEqual(self.transport.heartbeat_interval, 10.0)
        with self.assertRaisesRegex(ValueError, "5 to 10 seconds"):
            MqttTransport(host="example-ats.iot.test", thing_name=THING, robot_id=ROBOT,
                ca_file="ca", cert_file="cert", key_file="key", authorize=lambda _: True,
                safety_ready=lambda: True, on_command=lambda _: None,
                dedupe_path="seen.json", heartbeat_interval=30)
    @unittest.skipIf(os.name=="nt","Windows key ACL validation is fail closed")
    def test_invalid_joint_payload_never_reaches_runtime(self):
        self.connect(); e=self.envelope(); e["payload"]["program"]["steps"]=[{"type":"joint.setpoint","joint":"elbow","position":1}]
        self.transport._on_message(self.transport.client,None,types.SimpleNamespace(topic=self.transport.topics["commands"],payload=json.dumps(e).encode(),retain=False))
        self.assertEqual(self.called,[])

    @unittest.skipIf(os.name=="nt","Windows key ACL validation is fail closed")
    def test_inner_payload_robot_must_match_web_command_identity(self):
        self.connect(); e=self.envelope(); e["payload"]["robotId"]="22222222-2222-4222-8222-222222222222"
        self.transport._on_message(self.transport.client,None,types.SimpleNamespace(topic=self.transport.topics["commands"],payload=json.dumps(e).encode(),retain=False))
        rejected=[p[1] for p in self.transport.client.published if p[1].get("kind")=="ack"][-1]
        self.assertEqual((rejected["status"],rejected["code"]),("rejected","command_payload_invalid"))
        self.assertEqual(self.called,[])
    @unittest.skipIf(os.name=="nt","Windows key ACL validation is fail closed")
    def test_runtime_failure_and_busy_runtime_publish_terminal_failed_without_completion(self):
        self.connect()
        for index, (command_id, failure) in enumerate(((CMD, RuntimeError("runtime_failed")), ("ab1b9c2e-d155-4e4b-bf74-9c3f7e403e1a", RuntimeError("runtime_busy")))):
            self.transport.on_command = lambda _payload, error=failure: (_ for _ in ()).throw(error)
            envelope = self.envelope(1700000000000 + index * 100); envelope["commandId"] = command_id
            message = types.SimpleNamespace(topic=self.transport.topics["commands"], payload=json.dumps(envelope).encode(), retain=False)
            self.transport._on_message(self.transport.client, None, message)
            events = [entry[1] for entry in self.transport.client.published if entry[1].get("commandId") == command_id]
            self.assertEqual([event["status"] for event in events], ["accepted", "executing", "failed"])
            self.assertEqual(events[-1]["code"], failure.args[0])
            self.assertFalse(any(event["status"] == "completed" for event in events))

    @unittest.skipIf(os.name=="nt","Windows key ACL validation is fail closed")
    def test_telemetry_rejects_duplicate_sequence(self):
        self.connect()
        frame={"schema_version":1,"robot_id":ROBOT,"source_mode":"SIMULATION","controller_id":"fake",
          "measured_at":"2026-11-25T00:00:00Z","sequence":1,"connection":"connected",
          "measured":[{"name":name,"position":0.0,"unit":"rad"} for name in ("shoulder_pan","shoulder_lift","elbow_flex","wrist_flex","wrist_roll","gripper")]}
        self.assertTrue(self.transport.publish_telemetry(frame))
        with self.assertRaisesRegex(ValueError, "increase monotonically"):
            self.transport.publish_telemetry(frame)

    @unittest.skipIf(os.name=="nt","Windows key ACL validation is fail closed")
    def test_safety_gate_rejects_before_acknowledging_execution_and_disconnect_is_offline(self):
        self.transport.safety_controller=LocalSafetyController(); self.connect()
        msg=types.SimpleNamespace(topic=self.transport.topics["commands"],payload=json.dumps(self.envelope()).encode(),retain=False)
        self.transport._on_message(self.transport.client,None,msg)
        ack=[p[1] for p in self.transport.client.published if p[1].get("kind")=="ack"][-1]
        self.assertEqual((ack["status"],ack["code"]),("rejected","hardware_not_commissioned"))
        self.assertEqual(self.called,[])
        client = self.transport.client
        self.transport.disconnect()
        self.assertFalse(self.transport.status()["connected"])
        self.assertFalse(self.transport.status()["offlineQueue"])
        shadows = [entry[1]["state"]["reported"]["connection"] for entry in client.published
                   if entry[0] == f"$aws/things/{THING}/shadow/update"]
        self.assertEqual(shadows[-1], "offline")

if __name__=="__main__": unittest.main()
