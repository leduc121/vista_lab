# VISTA Lab Station 0.1.0 — Internal Release Candidate

## Included

- Electron desktop shell with isolated renderer and typed IPC.
- Local Edge Runtime lifecycle, MuJoCo simulation, unified safety gate, emergency-stop latch, watchdogs, and fail-closed physical hardware output.
- Four SO-101 device roles and injected LeRobot follower `send_action` adapter behind the safety authority.
- Dual-pair leader/follower software workflow, tested with mock LeRobot adapters; physical output remains disabled.
- MQTT Edge Runtime configuration and connect/disconnect lifecycle, command allowlist and dedupe, ACK/status, Shadow, Last Will, reconnect and graceful shutdown. AWS is not enabled in this candidate.
- Local episode recording, `vista.robot.recording.v1` manifests, SHA-256 integrity, and the local mock evidence acceptance.
- checkIk FK/IK integration, labeled experimental because the MuJoCo gripper-frame mismatch is about 19.9 mm.
- Simulation (bundled Python 3.11) and optional Robotics (operator-selected Python 3.12.14) runtime profiles share the same Edge Runtime and LocalSafetyController. Profile switching waits for the old child to exit and is blocked while an arm is connected or execution is active.

## Verification

This candidate is built for internal evaluation. The test suite verifies local simulation, mock transport, recording contracts and runtime safety. It does not verify physical robots, AWS IoT, production evidence persistence, or public distribution rights for checkIk-derived files.

The Linux candidate in `dist/vista-capstone-final-rc/` was smoke-tested with both profiles. Robotics profile validation covered Python/Torch/LeRobot/MuJoCo imports only and ran in simulation with hardware output disabled. It requires an operator-selected Python environment and authorized Edge source tree; those are not bundled.

## Distribution status

Internal candidate only. Unsigned/not notarized unless a platform's native signing job is run with approved credentials. Do not publish or upload to production storage pending project-owner approval and source/asset ownership confirmation.
