# VISTA Lab Station — Final Robotics Lab Acceptance

**Date:** 2026-11-25  
**Scope:** Existing v0.1.0 Ubuntu DEB candidate and current source contracts.  
**Safety boundary:** No physical serial device was enumerated or opened, no calibration/hardware configuration was invoked, no physical motion occurred, and no Production/AWS service was contacted.

## Verdict

- **Simulation Profile:** **PASS** for actual bundled MuJoCo execution without physical hardware. The extracted candidate rendered the SO-101 model, updated local joint telemetry, completed a Blockly simulation, reset between runs, and shut down safely. The physical output lock stayed on.
- **Strict simulated joint-limit telemetry:** **PASS on the rebuilt local candidate.** The original owner DEB had a gripper transient at **−0.188738 rad** against a declared lower limit of **−0.174533 rad**. A narrow simulated open-target margin was added and regression-tested; the rebuilt packaged runtime completed the same five-step exercise with all 22 measured frames inside all six joint ranges (gripper minimum **−0.170727 rad**).
- **Programming and command contracts:** **PASS** for the existing local and mocked execution contracts. Previously accepted isolated Education API/PostgreSQL results remain the evidence for the Web student workflow. This turn added no editor or API.
- **CheckIK Cartesian target fidelity:** **FAIL** for precise target matching. URDF and MuJoCo base frames show a systematic approximately 19.8–20 mm offset. Existing code applies a 20 mm rejection threshold; targets over it fail closed. Keep Cartesian experimental and Simulation-only.
- **Fake Robotics Profile paths and shared safety:** **PASS in fake/mock tests.** The real Robotics dependency environment is **BLOCKED**: Python 3.12 is present but Torch, LeRobot, MuJoCo and pySerial are absent there. No physical commissioning was attempted.
- **Recording/evidence:** **PARTIAL / BLOCKED for command-bound production evidence.** Existing schema recording, telemetry/hash integrity and a local mock evidence contract pass. `vista.robot.recording.v1` manifests currently contain no `commandId`, and the desktop recording UI is not wired to record Blockly MuJoCo frames. The test mock carries commandId separately; this does not establish production association.
- **AI/VLA:** **PASS for explicitly labeled mock simulation proposals and guard tests; BLOCKED for real model actuation semantics.** Prior ACT inference-only evidence is retained. ACT ignores natural-language prompts and its action mapping is unverified. SmolVLA inference was not run. No physical AI execution was attempted.
- **Ubuntu Simulation release:** the original owner DEB had a real simulated joint-limit defect. A local rebuilt candidate fixes it and passed packaged-runtime and Electron smoke verification. The owner-provided DEB remains untouched and still has the defect. Recording/evidence and Cartesian precision gaps block accepting those capabilities, not the simulation-only installer.

## Evidence from this acceptance

- Rebuilt local candidate: `dist/phase6-candidate/VISTA Lab Station-0.1.0-amd64.deb`, 296291230 bytes, SHA-256 `8eb5d74c23a3be4d2164f7e58bbbb0938467240cead40eabc328e846a29309b4`. This candidate was built only in the workspace; it was not published.
- Untouched owner candidate: `/tmp/vista-release-v0.1.0-45628473427/VISTA.Lab.Station-0.1.0-amd64.deb`, SHA-256 `a5dbca4d54a28de1aae2f254b08484460efb3db6a3eeee7828d8dc24ea3ba8e4`.

- The untouched owner DEB also passed its initial Electron smoke under Xvfb at 1400×900 before the stricter five-step bound check exposed the gripper defect.
- Rebuilt candidate Electron smoke passed under Xvfb at 1400×900: Demo login → Labs → existing Blockly assignment → save/version → local MuJoCo → Demo schematic result → runtime ready with physical output locked. The local run reported **2 validated steps**, physics telemetry, and `motionEnabled=false`. Demo data is not Education API persistence.
- Rebuilt candidate screenshots with model and joint values: `/tmp/vista-electron-smoke/electron-mujoco-robotics-final.png`; runtime settings: `/tmp/vista-electron-smoke/electron-runtime-profile-robotics-final.png`.
- Bundled runtime reset probe completed consecutive gripper-close and gripper-open simulations (2 steps each); the second run started from a fresh MuJoCo state. It shut down by the runtime stop protocol. Both returned simulation mode and `motionEnabled=false`.
- The original owner candidate full five-step probe (`arm.select`, `home`, Cartesian preview, gripper open, gripper close) emitted 22 frames; gripper reached −0.188738 rad. After the fix, the rebuilt bundled runtime completed the same five steps and emitted 22 measured frames. Every joint stayed within the model range; gripper ranged from −0.170727 to 0.111679 rad. Result was `engine=MuJoCo`, `mode=SIMULATION`, `motionEnabled=false`.
- Recording probe wrote and stopped one local episode. It verified `vista.robot.recording.v1`, experiment/robot/episode identifiers, start/end timestamps, one six-joint frame, and a matching SHA-256. Missing trajectory and corrupted JSON were rejected on `get()`; the UI displays that read error. The list path omits unreadable episodes, so damaged episodes are not currently shown with a warning.
- Environment check: Edge Python **3.11.16** has NumPy, MuJoCo and serial support but no Torch or LeRobot. Python **3.12.14** is installed, with none of Torch, LeRobot, MuJoCo or pySerial. No LeRobot install or device discovery was attempted.

## A. Simulation Lab

| Capability | Result | Evidence / limit |
| --- | --- | --- |
| Start simulation and load existing SO-101 model | **PASS** | Exact extracted candidate uses bundled Edge Runtime and `models/so101/scene.xml`; MuJoCo health reported available. |
| Stop/cancel and safe shutdown | **PASS** | Existing active-run cancellation test passes; candidate runtime stop protocol and Electron exit completed. No physical outputs exist in this path. |
| Render the robot | **PASS** | Candidate screenshot shows the loaded SO-101 model in the local Twin viewport. This is alongside actual MuJoCo execution, not a claim that the mesh viewer itself is physics. |
| Joint control / command limits | **PASS** | Actual home/gripper Blockly steps ran; CheckIK and Safety Controller tests cover six-joint names, radians, finite values, ranges, and guarded simulation sinks. No arbitrary actuator editor or physical command is exposed. |
| Measured joint limits | **PASS on rebuilt local candidate** | The original DEB reached −0.188738 rad. The rebuilt candidate measured a minimum of −0.170727 rad over 22 frames, inside the declared −0.174533 rad lower bound; all six joints stayed in range. |
| State updates and telemetry | **PASS** | UI displayed six joint readings and MuJoCo step status; bundled runtime probe emitted seven measured physics frames. |
| Reset behavior | **PASS** | Two consecutive candidate runs produced independent states; each simulation creates a fresh MuJoCo data state. |
| Execution status and experiment completion | **PASS locally** | UI reported “MuJoCo simulated 2 validated steps using scene.xml”; this was Demo/test-fixture scope, not a persisted Education API experiment. |
| Record the simulation as an experiment | **BLOCKED** | The user-facing episode recorder samples a connected LeRobot `joint_state`; Blockly MuJoCo frames are not connected to that recorder. |
| Works without physical hardware | **PASS** | Candidate Simulation Profile ran with no robot connected. Hardware output stayed disabled. |

## B. Programming Lab and execution contract

The existing Education API client uses the current student routes for program create/update/read, immutable versions, attempt submission, schematic experiment creation/run/status/events/result, and artifact list/download. The existing renderer retains its current programming flow; no second editor or API contract was added in this acceptance.

| Capability | Result | Evidence / limit |
| --- | --- | --- |
| Payload and validation | **PASS** | Edge allowlist validates schema, command ID/expiry, step count/types/fields, wait budget, arm selection, active attempt, explicit simulation authorization and confirmation. Existing API contract suite: 25/25 passed. |
| Execution request/readiness | **PASS locally** | Packaged Simulation Profile readiness and MuJoCo model health passed. Existing Web programming integration was previously accepted against a disposable API/GoTrue/PostgreSQL stack; no live service was contacted in this turn. |
| Successful execution/result | **PASS locally** | Candidate MuJoCo run completed. Existing local MQTT contract also verifies `accepted → executing → completed` and correlated robot/command IDs. |
| Invalid program rejection | **PASS** | Unsupported code/steps, invalid waits, unreachable targets, stale/expired authorization and wrong attempt states are rejected by Edge tests. |
| Duplicate command handling | **PASS in local contract tests** | Duplicate MQTT command replays deterministic lifecycle events without a second execution; duplicate local simulation command IDs fail closed. |
| Stop, cancellation, timeout, runtime failure | **PASS in tests** | MuJoCo cancellation, MQTT timeout/runtime-failure terminal state, and fail-closed runtime tests passed. No live broker was used. |
| Result/evidence association | **PARTIAL** | WF03 local fixture ties MQTT `commandId` to experiment/robot/episode and a mock evidence response. It does not prove production API/object-store association. The saved desktop manifest lacks `commandId`. |

## C. Robot control and CheckIK

| Capability | Result | Evidence / limit |
| --- | --- | --- |
| Forward kinematics / inverse kinematics | **PASS for existing CheckIK solver** | FK/IK round-trip and a reachable target pass; solver was reused unchanged. |
| Reachability and invalid targets | **PASS** | Unreachable Cartesian targets produce no solution and do not reach the simulation sink. |
| Units and finite-number validation | **PASS** | Cartesian request accepts exactly three finite metre coordinates; booleans, NaN/Infinity, wrong shape, and values outside the ±1 m request envelope are rejected. No orientation request is accepted. |
| Joint limits / safe failure | **PASS** | IK solutions must be finite and within URDF joint limits; resulting MuJoCo targets are checked under the shared safety gate. Invalid targets are rejected before application. |
| Cartesian target fidelity | **FAIL — known frame offset** | The URDF CheckIK base and MuJoCo base differ systematically by about 19.8–20 mm in the recorded workspace sweep. Runtime rejects a request if computed mismatch exceeds 20 mm; values below the threshold can still miss the requested point by nearly 20 mm. |
| Physical Cartesian control | **NOT RUN / BLOCKED** | Cartesian remains local Simulation-only. No physical acceptance exists. |

The frame offset does not affect the tested allowlisted Blockly MuJoCo exercise. It does limit the accuracy claim for the experimental Cartesian tool. No solver replacement or unsupported orientation feature was introduced.

## D. Robotics Profile and fake LeRobot/SO-101

| Capability | Result | Evidence / limit |
| --- | --- | --- |
| Python/runtime environment detection | **BLOCKED for a ready Robotics Profile** | App requires a separately configured Python 3.12 and Edge source. Python 3.12 exists, but its LeRobot/Torch/MuJoCo/pySerial dependencies are absent. The packaged Simulation runtime remains ready independently. |
| Robot discovery and connection state | **PASS in fake contracts; NOT RUN on serial hardware** | Runtime tests use fake ports/devices and validate explicit port/role pairing, discovery response shape, connect state and disconnect behavior. No OS serial discovery/connection was initiated. |
| Calibration state | **PASS in fake workflow tests; physical calibration NOT RUN** | Tests verify confirmation, discovered-port requirement, role/slot ownership, per-write authorization and that incomplete capture does not become calibrated. No calibration or device configuration operation was invoked. |
| Leader/follower and dual pair | **PASS in mock tests** | Role separation, distinct port ownership, pair isolation, duplicate port rejection and dual-slot state are covered. |
| Teleoperation authorization | **PASS for fake simulation; physical teleoperation NOT IMPLEMENTED** | Explicit enable, hold-to-run/deadman, fresh sequence, rate/position/velocity limits, watchdog, e-stop and reset are tested on fake in-memory devices. |
| Recording/disconnect/shutdown | **PASS in mock contracts** | Fake runtime and manager tests cover disconnect, stop, interrupted recovery, and shutdown attempting each adapter even if one disconnect fails. The shutdown test logs its injected failure and passes its fail-safe assertion. |
| Physical commissioning | **BLOCKED / NOT RUN** | No physical device access, calibration, hardware configuration or movement was performed. |

## E. Shared Safety Controller

| Path / control | Result | Evidence / limit |
| --- | --- | --- |
| Manual / Cartesian | **PASS in guarded Simulation tests** | Ownership, exact joint order, radians, identity, finite values, range, velocity and watchdog checks protect the simulation sink. |
| Programming | **PASS in guarded MuJoCo tests** | Active-attempt auth, expiry, explicit `RUN_SIMULATION`, allowlist, cancellation and safety action guard are required. |
| Teleoperation | **PASS for fake device path** | Deadman release/loss, stale sequence, rate/velocity/joint range, disconnect and latched stop prevent command application. |
| MQTT command path | **PASS with fake/local transport** | Unified safety readiness is required before accepting a command; invalid commands fail before ACK/execution, and no servo/joint setpoint payload is accepted. No AWS connection occurred. |
| AI/VLA proposal | **PASS for mock simulation path** | Six ordered radians, finite/range validation and Safety Controller action gate protect the MuJoCo sink. Real ACT semantic mapping stays blocked. |
| E-stop / explicit reset / no auto re-arm | **PASS** | Latched stop rejects before the sink; reset requires explicit confirmation and clears ownership without auto-enabling. |
| Invalid/stale/replayed commands, disconnect, watchdog, runtime failure, shutdown | **PASS in targeted tests** | Shared controller and protocol tests cover each fail-closed transition. No physical output was enabled. |
| Recording replay isolation | **PASS by exposed path boundary** | Replay screen changes frames on the read-only viewer and explicitly states “Visualization replay only · physical replay disabled”; no actuator replay method is exposed through the recording UI. |

## F. Recording and replay format

| Requirement | Result | Evidence / limit |
| --- | --- | --- |
| Start/stop; metadata; timestamped trajectory | **PASS for local manager format** | Test writes `vista.robot.recording.v1`, experiment/robot/episode IDs, started/ended times, runtime kind, and timestamped six-joint NDJSON. |
| Artifact integrity | **PASS** | SHA-256 from stop/list equals the actual NDJSON bytes. |
| Command identifier | **FAIL for manifest association** | `commandId` is absent from the current local manifest. The mock WF03 evidence request associates it separately; the Desktop recording/upload path does not establish the same correlation. |
| Evidence format | **PARTIAL** | Existing schema is reused; no parallel schema was added. WF03 mock validates manifest schema/hash/experiment/robot/episode and separately returned command ID. Live backend acceptance is not claimed. |
| Replay visualization | **PASS for visualization-only boundary** | Renderer applies stored frames to the URDF viewer and has no playback-to-actuator path. A complete interactive recording/replay Electron journey was not rerun. |
| Missing/corrupt artifact | **PASS fail-closed on read; PARTIAL discovery UX** | `get()` rejects missing files and invalid JSON, and renderer displays the read error. `list()` omits malformed/missing entries without a diagnostic row. |
| Simulation recording/evidence | **BLOCKED** | Local MuJoCo frames are not sampled by the user-facing recorder and have no authorized student upload route. |

## G. AI / VLA

| Requirement | Result | Evidence / limit |
| --- | --- | --- |
| Provider availability | **BLOCKED for a real provider in current runtime** | Current Python 3.12 Robotics environment has no Torch or LeRobot. No model download/install was performed. Prior ACT inference used an isolated compatible environment. |
| Simulation observation | **PASS in adapter tests** | Six-joint state and declared virtual camera inputs are shape-checked and converted; camera renderer is mocked in the unit contract. |
| Mock provider / classification | **PASS** | Fixture proposal is labeled `MOCK_MODEL`, records latency/scope, and reports `SIMULATION`; tests ensure it cannot be presented as physical. |
| Proposal validation / timeout / invalid output | **PASS in tests** | Invalid units, joint count, non-finite/out-of-limit action, inference timeout and stale async result are rejected without executing a proposal. |
| Safety gate / experiment metadata | **PASS for mock simulation path** | Mock proposal enters the MuJoCo-only safety gate; action recorder stores simulation provider/model/latency and permitted experiment/episode context. |
| ACT prompt claim | **PASS — prompt is ignored** | ACT is not natural-language conditioned in this adapter; tests and prior inference evidence show the prompt is not sent as an instruction. No natural-language ACT capability is claimed. |
| SmolVLA / physical AI execution | **NOT RUN / BLOCKED** | No weights were downloaded; real SmolVLA inference and physical execution were not accepted. |

AI/VLA is not a blocker for the Ubuntu Simulation Profile release. ACT action semantics remain blocked from control use.

## Targeted tests executed

- `node tests/api.contract.test.cjs`: **25 passed, 0 failed**.
- `node --test --test-concurrency=1 tests/robot-runtime.test.cjs tests/teleoperation.test.cjs tests/recording-manager.test.cjs tests/policy-action-recorder.test.cjs tests/device-provisioning.test.cjs`: **5 focused suites passed, 0 failed**.
- `edge/.venv/bin/python -m unittest edge.tests.test_mujoco_simulation edge.tests.test_checkik_integration edge.tests.test_safety_controller edge.tests.test_teleoperation edge.tests.test_runtime edge.tests.test_calibration_workflow edge.tests.test_mqtt_transport edge.tests.test_policy_manager edge.tests.test_local_wf03_acceptance -v`: **85 passed, 0 failed**. One injected shutdown-disconnect exception is logged by its test and verified as handled.
- Rebuilt DEB Electron smoke at 1400×900: **PASS** through local MuJoCo and result; screenshots retained above.
- Original owner candidate runtime reset/shutdown probe: **PASS**; two fresh simulations, no hardware output.
- Rebuilt bundled runtime five-step strict-limit probe: **PASS**, 22 frames and all six joints within model limits.
- Prior isolated Education API/PostgreSQL acceptance is reused from [Desktop Completion Acceptance](../DESKTOP_FULL_ACCEPTANCE.md); it is not a new live backend run in this turn.

## Release disposition and actual blockers

1. **A local DEB rebuild was necessary and completed** because the owner-provided candidate crossed the gripper joint limit in measured simulation state. The source change keeps the simulated gripper-open servo target 0.02 rad inside the lower stop; it does not change physical hardware behavior. The rebuilt candidate passed the packaged five-step range check and Electron smoke. The original candidate remains unmodified and retains the defect. No merge or publication occurred.
2. **End-to-end evidence acceptance is blocked** until the approved current evidence contract establishes commandId association and a supported route captures local simulation episodes. Do not add a new schema or guess an API field.
3. **Cartesian target fidelity fails the 20 mm precision gate** because of the known frame mismatch. Keep it marked experimental and Simulation-only; do not represent it as accepted physical Cartesian control.
4. **Physical commissioning is BLOCKED / NOT RUN** until the owner supplies hardware and supervised authorization.
5. **Real SmolVLA and ACT action execution remain unaccepted** and do not block the simulation-only Ubuntu candidate.

No physical actuation, serial connection, calibration, hardware configuration, AWS/Production request, merge or publication occurred. The MuJoCo source and regression test were changed for the defect; the existing acceptance smoke script gained optional viewport sizing for evidence capture.
