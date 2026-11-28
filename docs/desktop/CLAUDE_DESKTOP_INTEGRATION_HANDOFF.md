# Desktop integration handoff for Claude

**Date:** 2026-11-28
**Scope:** One SO-101 leader/follower pair; Desktop Lab Station boundary only. Dual-arm physical operation and physical VLA execution remain deferred. No Backend/Web/AWS source was changed and no live service was contacted.

## Locked robotics environment and adapter verification (2026-11-28)

The owner-authorized `uv sync --project edge/robot-runtime --locked --python 3.12` completed successfully in `edge/robot-runtime/.venv` using CPython 3.12.14. The lockfile is unchanged and was the source of truth. Verified installed versions: LeRobot 0.6.1, Torch 2.7.1+cpu (CUDA unavailable), NumPy 2.2.6, MuJoCo 3.17.0, pySerial 3.5, Feetech SDK 1.0.0 (`scservo_sdk`). TorchVision 0.22.1+cpu, Paho MQTT 2.2.0, PyInstaller 6.19.0 and CMake 3.31.6 also match the lock.

The pinned public imports succeed: `lerobot.teleoperators.so_leader.SO101Leader` / `SO101LeaderConfig` and `lerobot.robots.so_follower.SO101Follower` / `SO101FollowerConfig`. Their LeRobot 0.6.1 `connect(calibrate=False)`, leader `get_action`, follower `get_observation` and `send_action` APIs are compatible with the Desktop adapter call sites in `edge/runtime.py`; calibration profiles use the corresponding role-specific config modules in `edge/calibration.py`. Import and call-shape compatibility was checked without creating either hardware object connection, enumerating/opening a port, or writing calibration/motor state.

Targeted mocked tests under that exact interpreter: 56 passed across `edge.tests.test_runtime`, `test_calibration_workflow`, `test_serial_ownership`, `test_safety_controller`, and `test_teleoperation`. `EdgeSupervisor` launched the selected `edge/robot-runtime/.venv/bin/python` and this source root: driver modules were ready, follower remained disconnected/uncalibrated, Robotics diagnostics correctly remained `ACTION REQUIRED`, and `hardwareEnabled=false` / `motionEnabled=false`. The packaged Ubuntu 0.1.1 Demo/Simulation Electron smoke passed after the sync. Robotics Python is selected separately in Settings and is not bundled into the package; the existing DEB/AppImage therefore do not need rebuilding because of this external environment installation. No physical connection, calibration, MQTT, cloud, or motion was performed.

### Physical safety configuration checklist (currently absent; blocks physical arming)

There is no checked-in approved physical safety profile. The code schema is currently injected into the existing runtime, not loaded from a dedicated file: `LeRobotSO101Adapter` in `edge/runtime.py` requires `position_limits_rad` and `velocity_limits_rad` maps for the exact six names in `edge/safety_controller.py` (`shoulder_pan`, `shoulder_lift`, `elbow_flex`, `wrist_flex`, `wrist_roll`, `gripper`) plus an owner-approved callable `safe_stop` handler. `LocalSafetyController` defaults `hardware_enabled=False`; its constructor exposes command watchdog and runtime heartbeat timeout values. The current `.25 s` watchdog and `2.0 s` heartbeat values are software defaults, not approved physical limits. The simulation teleoperation rate/limits are not physical configuration.

Before a supervised owner can authorize physical setup, provide and review: stable leader and follower IDs and role/port assignment; each role's validated existing calibration file (preserve it); six joint position and velocity limits in the adapter's expected units; approved physical command-rate and stale-command bounds; chosen watchdog/heartbeat thresholds and fault action; implementation and verification of safe stop/hold; initial pose tolerance and reconnect/re-arm behavior; and the independent physical E-stop's device-specific operating and recovery procedure. No value is inferred from simulation, LeRobot defaults, or these code defaults. Connection itself invokes LeRobot configuration and is therefore also owner-supervised.

## Claude-side work required before live WF03 integration

Complete the confirmed dependencies below before any live WF03 session: (1) provide the approved existing API authorization bridge/context and bind execution to the persisted attempt/session without inventing Desktop fields; (2) define existing command cancellation/stop and terminal lifecycle behavior for operator stop, session/command expiry and runtime loss; (3) identify the sole deployed physical runtime/identity and approved handover point, and confirm no shared Thing/client owner is active; (4) identify the owner and exact contract for forwarding measured physical telemetry with controller/robot identity, units, sequence, timestamp and disconnect freshness; (5) confirm manifest-to-attempt/session/outcome binding, worker validation, S3 persistence and the authoritative storage-confirmed API state; and (6) identify the deployed Edge source revision/host and verify it implements the approved ownership decision. These are Backend/Cloud/deployment confirmations; Desktop remains fail-closed until the relevant integration boundary is supplied. The detailed actual/expected behavior and open questions below remain applicable.

## Source references

- Approved external source of truth, read in Queue 04: `/home/quangduc/Code/vista/se-final-rc/docs/operations/EDGE_CONTRACT_HANDOFF_20261126.md` (finalized 2026-11-27), especially §12; related physical commissioning, Digital Twin, Desktop integration and owner approval handoffs are recorded in `QUEUE04_CLAUDE_INTEGRATION_HANDOFF.md`.
- Desktop implementation: `api.js`, `main.js`, `preload.js`, `edge-supervisor.js`, `edge/runtime.py`, `edge/mqtt_transport.py`, `edge/safety_controller.py`, `edge/calibration.py`, `recording-manager.js`, `renderer/twin-viewer.js`, `renderer/app.js`.
- Desktop evidence/checkpoints: `API_CONTRACTS.md`, `QUEUE06_FINAL_ACCEPTANCE_REPORT.md`, `QUEUE04_CLAUDE_INTEGRATION_HANDOFF.md`, `UNIFIED_SAFETY_ACCEPTANCE.md`, `TEST_REPORT.md`.

## Existing API and MQTT contract

**Student API routes currently used by Desktop:**

- Attempts/programs: `POST /classroom-assignments/:id/attempts`, `GET /me/attempts/:id`, `GET/POST /me/attempts/:attemptId/program`, `PATCH /me/programs/:programId`, `GET/POST /me/programs/:programId/versions`, `POST /me/attempts/:attemptId/submission`.
- Experiment lifecycle: `POST /me/attempts/:attemptId/experiments`, `GET /me/experiments/:id`, plus the existing schematic run/events/result routes described in `API_CONTRACTS.md`.
- Twin authorization: `POST /me/attempts/:attemptId/digital-twin/viewer-scope` with robot ID and optional `labSessionId`; token is attempt-scoped and short-lived (≤60 seconds), passed via `vista.twin.<token>` WebSocket subprotocol to the configured `/ws/twin` endpoint.
- Physical eligibility/status: `GET /me/attempts/:attemptId/physical-execution-eligibility`, `GET /me/attempts/:attemptId/physical-executions/active`, `GET /me/physical-executions/:experimentId`.
- Recording/evidence: `POST /me/experiments/:experimentId/recordings/uploads` requests the existing API-issued presigned file upload; after uploading the artifact, Desktop posts `manifest.json` last and polls existing experiment recording/evidence status. A local hash is not backend/S3 persistence confirmation.

**MQTT contract from the approved Edge handoff:** topics are the existing `vista/demo/robots/<robot UUID>/{commands,ack,status,telemetry}` plus the Thing’s existing classic Shadow topics. The reference identity is robot UUID `f1c066c4-b5f2-45c4-b933-f034f3824dd9`, Thing/client `vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9`; this is reference only and was not used.

The existing command is a v1 `run` with UUID `commandId`, robot UUID, sequence, issue/expiry timestamps, and payload exactly `{runId, robotId, programVersionId, profile, program}`. `profile` is `lesson`; the program uses the existing allowlisted steps. `runId` is `wf03-<experiment UUID>`. ACK/status events carry robot/command IDs, deterministic event IDs, sequence and timestamps: accepted/rejected ACK, executing, and terminal completed/failed status. Shadow reports runtime truth and must heartbeat within 10 seconds. Simulation telemetry is six ordered channels `shoulder_pan, shoulder_lift, elbow_flex, wrist_flex, wrist_roll, gripper`; max 2 Hz and 120 frames per run. The approved handoff defines a separate measured physical telemetry class, five arm joints in degrees and gripper in percent. Session/attempt association is backend-derived from persisted lifecycle, not invented in MQTT frame fields.

## Authorization, identity and lifecycle

**Expected:** Education API authorizes the student/session/attempt and issues an execution authorization that is bound to the robot, active experiment/attempt/session, permitted program/version and expiry. Exactly one runtime owns the robot. The approved handoff assigns Desktop Edge Runtime as the physical owner and R1 as simulation-only; R1 and Desktop never use the same Thing/client identity concurrently. On restart/reconnect, arming clears and motion requires a fresh explicit authorization and operator arm.

**Actual:** Desktop API calls use the authenticated student bearer session. The MQTT envelope has `runId` but no attempt or session field. Desktop `EdgeRuntime` defaults its MQTT authorizer to deny-all; Electron does not inject an authorizer. `mqtt_command_executor` is absent by default, and the runtime refuses physical MQTT dispatch without it. Local MQTT tests validate identity, expiry, sequence, dedupe and lifecycle using fixtures only. There is no live backend-to-Desktop authorization handoff or live Edge deployment verification.

**Confirmed integration gap:** a successful API student session is not, by itself, the Desktop MQTT command authorization callback. Claude must provide the approved existing authorization boundary and clarify how persisted backend state binds the `runId`/command to attempt/session; Desktop will not invent a field, endpoint or topic.

## Stop, expiry and disconnect semantics

**Expected:** Session or command authorization expiry fences/cancels an executing command; the backend records the prescribed terminal state and the single physical runtime stops. Runtime or adapter disconnect blocks further output and requires explicit recovery/re-arm. The contract’s lifecycle must distinguish rejected-before-execution from failed-after-acceptance.

**Actual:** Desktop local Stop latches the local software safety controller, clears leases and cancels local simulation/fake execution; runtime disconnect/read failures close adapters and latch a fault. This does not substitute for a physical E-stop, and the adapter has no configured hardware stop/hold callback. The MQTT command schema has no remote stop envelope/topic/step. Student API session-expiry handlers clear the local API session, but no wired command cancellation/fencing path exists for an already-running MQTT command.

**Confirmed incompatibility / clarification required:** remote stop and in-flight session-expiry semantics are not defined in the Desktop-visible command contract. Claude should identify the existing cancellation path and terminal event/status expected by the backend worker. Do not add a Desktop endpoint or MQTT topic.

## Telemetry and Digital Twin mapping

**Expected:** all state is identity-bound, ordered, timestamped and freshness-checked. Simulation frames are explicitly `SIMULATION`; physical telemetry is only measured follower state and is explicitly classified `PHYSICAL_ROBOT` from approved adapter/provenance. Six Desktop joint channels are ordered as above. Physical wire contract in the approved handoff uses five arm joints in degrees plus gripper percent; the Desktop local adapter uses six named joints and its measured LeRobot values, with local timestamps taken after read (not hardware timestamps). Commanded and measured values remain separate; offline fixtures/replay are not live telemetry.

**Actual:** `edge/mqtt_transport.py` validates/publishes only correlated `SIMULATION` telemetry during an active local command, caps it at 2 Hz/120 frames, and orders outer events independently of measured-frame sequence. `renderer/twin-viewer.js` validates the six-joint Desktop viewer contract and freshness. No live physical telemetry publisher/consumer or backend Twin acceptance was exercised.

**Confirmed gap:** the Desktop transport’s tested telemetry publisher is simulation-only; the physical telemetry form described in the approved handoff has no live Desktop-to-Backend integration evidence. Confirm which existing component owns physical telemetry serialization/forwarding and how controller/robot identity, units and timestamp provenance are checked. Do not make a physical frame appear live from a local fixture.

## Evidence and S3 confirmation

**Expected:** recording/evidence is tied to persisted execution, attempt/session, robot, runtime classification and terminal outcome. API issues upload authorization; the artifact upload is followed by manifest-last; backend verifies the file/hash and only then exposes evidence availability. Only measured follower data from an approved physical runtime can be physical evidence.

**Actual:** Desktop uses the existing student-authenticated upload route and checks Education API evidence status. Local recordings use the existing `vista.robot.recording.v1` format and integrity hash. Session ID is copied only if the experiment response provides it; actual command/action traces and terminal outcome are not guaranteed by the local measured-state stream. Desktop does not report persistence from a local hash or upload acceptance. No API/S3 upload was made.

**Claude-owned dependencies:** confirm backend binding of experiment to attempt/session/outcome, worker validation and S3 persistence status; clarify which API availability value is authoritative after manifest processing. Do not create a competing Evidence API or modify the approved manifest contract.

## Confirmed incompatibilities vs unverified assumptions

**Confirmed from source and local tests:**

1. MQTT command authorization remains deny-all unless an injected callback is provided; Desktop does not provide that callback.
2. Physical MQTT execution is not wired: the physical executor is absent, and the currently tested telemetry path accepts simulation frames only.
3. MQTT command schema has no stop operation; there is no Desktop-wired in-flight cancellation path for API session expiry.
4. MQTT command carries `runId` but not attempt/session identity; backend must resolve the persisted association.
5. Desktop physical adapter is not ready for action: owner-approved physical limits, configured safe-stop handler and physical calibration authorization are absent; defaults keep `hardwareEnabled=false` and physical calibration readiness false.
6. Desktop has no live evidence/S3 persistence confirmation; source and fixture tests do not establish backend storage.

**Unverified, not asserted as incompatible:**

- Whether Claude/backend already has a supported authorization or cancellation service outside the inspected handoff/source revision.
- Which terminal status is required for server-side stop, expiry, lost runtime, or operator cancellation.
- Whether Desktop has any approved AWS simulation role under the final handoff.
- Whether the runtime process installed at the actual Edge host matches either inspected source checkout; its host, revision, image, launch mechanism and owner remain unknown.
- Whether the backend currently binds recording evidence to attempt/session/outcome and exposes a durable storage-confirmed state for the current manifest.

## Requested Claude-side reply/change checklist

1. Point to the approved authorization mechanism and exact payload/context binding; confirm default-deny behavior is preserved until that mechanism is wired.
2. Confirm run-to-attempt/session resolution, session expiry handling and in-flight cancellation/terminal event through existing routes/services.
3. Identify the sole physical runtime owner and whether any R1 or Desktop AWS role is approved; give the safe identity-handover preconditions without issuing or sharing credentials.
4. Confirm the component and existing contract for physical measured telemetry, including controller identity, units, sequence/timestamp source and disconnect freshness.
5. Confirm recording manifest binding, S3 worker verification, and the exact API evidence state that means persistence is complete.
6. Provide the deployed Edge host/source revision/update mechanism and confirm it reflects the §12 ownership decision. An Education API deployment is not proof of an Edge Runtime update.

No shared contract changes are proposed from this Desktop handoff. No Backend, Web, Terraform, AWS IoT, certificate, policy, rule, Shadow, R1 source or Production state was modified or contacted.
