# Queue 04 — Desktop to Backend integration handoff

**Date:** 2026-11-28
**Scope:** Desktop Lab Station and physical adapter boundary for one SO-101 pair. No cloud, AWS, or physical connection was made.

## Approved contract references

Primary: `/home/quangduc/Code/vista/se-final-rc/docs/operations/EDGE_CONTRACT_HANDOFF_20261126.md` (finalized 2026-11-27). Reviewed with its `ROBOTICS_OWNER_APPROVAL_CHECKPOINT_20261126.md`, `PHYSICAL_COMMISSIONING_RUNBOOK_20261127.md`, `acceptance/ROBOT_3D_DIGITAL_TWIN_HANDOFF.md`, and `acceptance/DESKTOP_ROBOT_INTEGRATION_HANDOFF.md`.

The primary handoff’s §0 says R1 needs a physical adapter, but its later §12 explicitly supersedes that architecture: Desktop Edge Runtime is the one physical owner; Education R1 is simulation-only and must not access serial hardware. Use §12 for ownership. The R1 sources and all external checkouts were left untouched.

## Contract observed in Desktop

- MQTT topics: `vista/demo/robots/<robot UUID>/{commands,ack,status,telemetry}` plus the Thing’s existing classic Shadow topics. Fixed example identity in the owner handoff: robot `f1c066c4-b5f2-45c4-b933-f034f3824dd9`, Thing/client `vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9`. This is reference-only; do not connect until an owner-supervised identity handover.
- Command: v1 `run`, UUID `commandId`, robot UUID, sequence, `issuedAtMs`, `expiresAtMs`; payload exactly `{runId,robotId,programVersionId,profile,program}` with `profile=lesson` and allowlisted `arm.select`, `home`, `gripper.open`, `gripper.close`, `wait` steps. `runId` is `wf03-<experiment UUID>` in the contract.
- ACK/status: v1 events with robot/command IDs, deterministic event IDs, increasing sequence and timestamps; accepted/rejected ACK followed by executing and terminal completed/failed status. Expiry, identity mismatch, replay and unsafe input reject before execution; duplicate command IDs do not execute twice.
- Shadow: runtime truth fields include connection, runtimeKind, hardwareEnabled, stopped, activeRunId, lastCommandSequence, reportedAtMs, adapterMode, armed, calibrationReady and fault. Heartbeat interval is at most 10 seconds; local arming clears on reconnect/restart.
- Simulation Twin telemetry is `status:"telemetry"` on existing status topic, explicitly `source_mode:"SIMULATION"`, correlated to command, six ordered channels `shoulder_pan, shoulder_lift, elbow_flex, wrist_flex, wrist_roll, gripper`, measured timestamp and sequence; max 2 Hz / 120 frames per run. Backend derives experiment/attempt/session association from persisted lifecycle, not a frame field.
- Physical Twin telemetry is a separate `status:"physical_telemetry"` message built from measured follower observation; five arm joints in degrees and gripper in percent. API/backend classify PHYSICAL_ROBOT from an allowlisted adapter mode and persisted provenance. Never label mock frames physical.
- Student/session authorization and attempt association remain API/backend-owned. The MQTT envelope has no session or attempt ID. Local command `runId` does not replace backend attempt binding.

## Desktop behavior and tests

`edge/mqtt_transport.py` validates command identity/schema/expiry/sequence/runId, persists dedupe, publishes ACK/status, manages Shadow heartbeat/offline state, and accepts only simulation telemetry during the active command. It keeps outer lifecycle sequence (after ACK/executing) independent from measured-frame sequence. `edge/runtime.py` routes local simulation to MuJoCo and cancels it on stop; `renderer/twin-viewer.js` validates the six-joint frame and freezes stale/disconnected/uncalibrated physical poses. The viewer does not convert gripper percent to jaw angle.

Fresh local verification: 46 Python tests (`test_local_wf03_acceptance`, `test_mqtt_transport`, `test_runtime`, `test_mujoco_simulation`), 26 API contract tests, and 3 Node test files (supervisor, recorder, robot runtime), all passed. Evidence is mock/fixture/MuJoCo only. No cloud or physical execution is claimed.

## Desktop gaps / exact questions for Claude

1. **Command authorization blocks all commands by default.** `edge/runtime.py` sets `mqtt_authorizer` to deny-all unless an injected callback is supplied; `main.js` does not supply one. Please confirm the approved backend-issued command authorization boundary and its binding to robot, active experiment/attempt/session, and expiry. The Desktop will not invent session fields or weaken the default-deny gate. Desktop now enforces the handoff's `wf03-<experiment UUID>` runId shape; backend remains the owner of the run-to-attempt/session association.
2. **No physical MQTT executor is wired.** The current runtime explicitly refuses physical MQTT execution when `mqtt_command_executor` is absent. Queue 03 also found no approved physical limits/safe-stop configuration. Please confirm the approved single-follower adapter mode and physical execution integration requirements when those safety inputs are approved.
3. **Stop contract is underspecified at the MQTT edge.** Local software Stop cancels simulation and disconnects cleanly; the command envelope and allowlisted steps define no remote stop message. Which existing API/backend cancellation flow stops an executing command, and which terminal status/event does the worker expect? No new topic or endpoint is proposed.
4. **Session expiry during execution:** please confirm whether expiry triggers cancellation/stop, how the active execution is fenced, and the expected lifecycle event. Desktop does not receive or persist an independent session/attempt identity in the MQTT frame.
5. **Phase A ownership:** §12 assigns AWS simulation to R1 + the fake follower and says Desktop may optionally provide MuJoCo Phase A. Please confirm whether Desktop should have any AWS simulation role. Current transport blocks non-physical AWS mode outside injected tests. No flag or identity was enabled here.

## Identity handover and non-execution record

R1 and Desktop must never run concurrently with the same Thing/client ID. For a future supervised switch: choose one owner, stop the other process, verify its disconnect/offline state, then start only the selected owner and verify its connection/Shadow before any authorized task. This task did not execute the procedure, open certificates, contact AWS, alter Thing/policy/Shadow, or use Production.

Physical connection/calibration/motion and cloud verification remain **NOT RUN**. Physical execution remains **BLOCKED** on the approved limits, verified local stop/hold behavior, calibration readiness, adapter mode and owner-supervised commissioning.
