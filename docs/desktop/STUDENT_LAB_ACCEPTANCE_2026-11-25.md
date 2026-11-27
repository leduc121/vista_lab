# Student Lab Product Acceptance — 2026-11-25

## Verdict

**Simulation lab journey: PASS in the Ubuntu v0.1.0 DEB candidate, using the explicitly labeled Demo client and local bundled MuJoCo runtime.** The candidate completed an allowlisted Blockly exercise, displayed physics-engine telemetry and a result, and reported `motionEnabled=false`. This is a product/runtime acceptance result, not a live Education API student record.

**Simulation recording/evidence journey: PARTIAL.** Local episode recording and visual replay exist, but the current recorder samples `joint_state` from a connected LeRobot arm. The runtime deliberately returns a connection error for a disconnected physical arm instead of substituting simulated joints. Blockly MuJoCo frames are not connected to the episode recorder. Simulation trajectory capture and upload are therefore not available through the student UI.

**Real student account, physical robot, and live backend acceptance: NOT RUN / BLOCKED by unavailable test environment and hardware.** No physical robot was present. No production/AWS, shared Supabase, MQTT, or physical actuation was used.

## Current candidate and test environment

- Candidate: `/tmp/vista-release-v0.1.0-45628473427/VISTA.Lab.Station-0.1.0-amd64.deb`
- Size: **131,395,882 bytes**
- SHA-256: **`a5dbca4d54a28de1aae2f254b08484460efb3db6a3eeee7828d8dc24ea3ba8e4`**, matching the owner-provided release candidate.
- The DEB was extracted to `/tmp/vista-final-deb-root` and launched from that extracted payload under Xvfb with Electron sandbox enabled. It was not system-installed or rebuilt.
- Extracted candidate Electron smoke: **PASS**. Login screen, Demo authentication, Labs, assignment workspace, Save, version creation, local MuJoCo, schematic Demo result, runtime profile, and physical-output lock were observed. The test ended and Electron closed; a second launch with retained user data was not performed.
- MuJoCo UI result: **“MuJoCo simulated 2 validated steps using scene.xml. Joint telemetry was read from the physics engine. Physical motion is disabled.”** The exercise used the clearly labeled Demo client/test attempt fixture; no Education API persistence is claimed.
- Packaged runtime probe: Python **3.11.18**, MuJoCo available, `scene.xml` available; allowlisted home-pose exercise completed **2 steps**, emitted **7** simulation telemetry frames, and returned `motionEnabled=false`.
- Screenshots: `/tmp/vista-electron-smoke/electron-workspace.png`, `/tmp/vista-electron-smoke/electron-mujoco.png`, and `/tmp/vista-electron-smoke/electron-runtime-profile.png`.
- A first source-tree smoke using the host default Python reached `simulation · ACTION REQUIRED`; rerunning with the repository MuJoCo environment (`VISTA_EDGE_PYTHON=edge/.venv/bin/python`) passed. The packaged candidate does not depend on this host Python; it uses its bundled Edge Runtime.

## Student first-run journey

| Step | Result | Evidence / boundary |
| --- | --- | --- |
| Startup | **AVAILABLE** | Extracted DEB executable opened as a sandboxed Electron window under Xvfb. No clean-machine install was tested. |
| Welcome/workspace entry | **PARTIALLY AVAILABLE** | Login screen and Labs entry work. The exercised identity was Demo; live school/student credentials were unavailable. |
| Profile selection | **AVAILABLE** | Simulation is the default packaged profile and reported `READY`. Robotics selection is separate and has prerequisites below. |
| Robotics Profile prerequisites | **REQUIRES EXTERNAL ENVIRONMENT** | Requires operator-selected Python 3.12 and a VISTA Edge source tree; the profile probes Torch, NumPy, LeRobot, MuJoCo and serial support. The installer does not bundle the Robotics Python/LeRobot environment. Physical connection additionally requires hardware. |
| Navigation | **AVAILABLE** | Labs → assignment → Blockly workspace → Settings/runtime profile. Other screens are present; the complete navigation tree was not exhaustively revisited in this run. |
| Robot visualization | **AVAILABLE / PARTIAL** | Workspace and local SO-101 visualization paths exist. This run exercised simulation frames; remote attempt-bound Digital Twin authorization needs a live Education API and Twin endpoint. |
| Start simulation | **AVAILABLE** | The extracted candidate ran the UI's explicit “Run local MuJoCo” control after confirmation. |
| Supported exercise | **AVAILABLE** | Blockly starter program ran two validated steps on bundled MuJoCo `scene.xml`; a test-only Demo attempt fixture authorized the local runtime path. |
| Execution status | **AVAILABLE** | Simulation progress/frame handling and completion status were observed in the Electron flow. |
| Results | **AVAILABLE** | UI returned the MuJoCo completion summary; the separate Demo schematic result explicitly stated that it did not execute backend, MuJoCo, or physical work. |
| Record experiment | **PARTIALLY AVAILABLE** | Local recorder stores measured joint-state episodes and integrity hashes when a supported arm is connected. **Simulation frames from Blockly are not recorded.** No simulation recording was accepted. |
| Review/replay | **PARTIALLY AVAILABLE** | Local episode library, timeline and visualization replay are implemented. This run did not create or replay an episode. Replay is visualization only; physical replay is disabled. |
| End safely | **AVAILABLE for simulation** | Local simulation has pause/resume/stop and safety-gated execution; physical movement remains locked. This run completed normally. |
| Close/reopen | **PARTIALLY AVAILABLE** | The smoke closed Electron cleanly. It did not relaunch against the same user-data directory to verify resumed student session or local episode recovery. |

The Demo client and generated attempt are clearly labeled. This acceptance does not treat Demo save/version/schematic behavior as Education API persistence, grading evidence, or physical execution.

## Product capability matrix

| Capability | Classification | What is accessible in the packaged application |
| --- | --- | --- |
| Simulation Lab | **AVAILABLE** | Bundled MuJoCo SO-101 model and local Blockly execution worked from the extracted candidate. Local simulation needs no robot. |
| Programming and execution integration | **PARTIALLY AVAILABLE** | Blockly validation/save/version UI and local allowlisted MuJoCo execution are available. Real assignment permissions, server save/version, result history and submission need a configured Education API and real student attempt. |
| Robot joint control | **PARTIALLY AVAILABLE** | Fake-device simulation controls are available and were covered by prior Demo/fake-runtime acceptance. No physical actuator command path is exposed. |
| Cartesian control | **PARTIALLY AVAILABLE** | Local Edge simulation control exists; this candidate journey did not exercise its UI. Browser preview explicitly cannot claim MuJoCo execution. |
| FK/IK | **PARTIALLY AVAILABLE** | Local kinematics implementation exists; acceptance is limited to local simulation/runtime contracts, not physical positioning accuracy. |
| Digital Twin visualization | **PARTIALLY AVAILABLE** | Local MuJoCo telemetry can drive the local read-only viewer. Remote Twin needs an operator endpoint, Education API scope and server-published telemetry; no live remote session was run. |
| Robotics connection | **REQUIRES EXTERNAL ENVIRONMENT / PHYSICAL HARDWARE** | Robotics profile requires separately configured runtime and a real arm/serial device. No arm was attached or connected. |
| Calibration | **REQUIRES PHYSICAL HARDWARE** | Guided LeRobot calibration requires a connected device and supervised manual calibration. It was not run. |
| Leader-follower teleoperation | **PARTIALLY AVAILABLE** | Fake simulation pairs support safety/deadman practice. Physical teleoperation is **NOT IMPLEMENTED** and physical start remains locked. |
| Experiment recording | **PARTIALLY AVAILABLE** | Local measured-joint episodes, manifest/hash, stop/recovery and replay exist. Current sample path requires connected arm joint state; it does not capture Blockly MuJoCo frames. |
| Trajectory replay | **PARTIALLY AVAILABLE** | Stored episode visualization replay is implemented; replay does not command a robot. This run did not exercise a recorded episode. |
| Evidence export/upload | **BLOCKED for local simulation evidence** | No student upload route for local simulation trajectories. Existing upload requires an API-issued scope and `PHYSICAL_ROBOT` recording. Real storage/instructor review needs configured backend/object storage. |
| Runtime connection status | **AVAILABLE locally** | Candidate reported bundled Edge/MuJoCo readiness. Cloud identity, allocation and heartbeat status require external services and were not live-verified. |
| Safety controls | **AVAILABLE for simulation; PHYSICAL ACCEPTANCE BLOCKED** | Local validation, safety authority, deadman and simulated stop controls exist. They are not a physical safety circuit; no physical operation was attempted. |
| AI/VLA | **PARTIALLY AVAILABLE** | Mock proposals are exercised through the MuJoCo-only gate in Edge tests and are labeled `MOCK_MODEL`. ACT CPU inference was accepted earlier, but ACT ignores natural-language prompts and action semantics remain unresolved; SmolVLA inference is unverified. No physical AI execution is accepted. |

## Defects and release blockers

1. **Simulation experiment capture is missing.** The episode recorder asks the Edge Runtime for a connected arm's `joint_state`; the runtime correctly refuses to invent measurements when the arm is disconnected. Local MuJoCo Blockly frames are not supplied to the recorder. This blocks a student from recording/replaying the simulation exercise as an experiment and from exporting it as evidence.
2. **Real student journey remains externally unverified.** No isolated Education API/student identity was available for live login, authorized attempt, real save/version, simulation authorization, persisted result, or submission in this acceptance.
3. **Live remote Twin/evidence services remain external.** No authorized Twin session or object storage was configured.
4. **Physical acceptance remains BLOCKED / NOT RUN.** No robot was available; calibration, live hardware telemetry and physical safety acceptance remain outstanding.
5. **Reopen persistence is not accepted.** Electron exited cleanly, but this run did not reopen with the same user-data folder.

At the time of this Student Lab acceptance, startup and the two-step simulation smoke passed; that check did not exercise strict joint-limit telemetry through a five-step program. The later [Final Robotics Lab Acceptance](ROBOTICS_LAB_FINAL_ACCEPTANCE_2026-11-25.md) found and fixed a simulated gripper limit overshoot in a local rebuilt candidate. The simulation recording gap remains a separate product capability gap because the current episode schema is experiment/robot-bound and backend evidence upload only accepts physical-robot recordings.

## Release disposition

- Existing DEB remains valid by size and SHA-256 match.
- The original owner DEB passed the startup and short simulation checks in this acceptance, but the later strict robotics acceptance found a five-step gripper limit defect. See the final robotics report for the rebuilt local candidate and its hash.
- Simulation-ready local lab journey: **PASS, Demo/test-fixture scope**.
- Full student-lab product acceptance: **PARTIAL** due simulation recording/evidence gap and absent live Education API.
- Physical robot acceptance: **BLOCKED / NOT RUN**.
- No merge or publication was performed.
