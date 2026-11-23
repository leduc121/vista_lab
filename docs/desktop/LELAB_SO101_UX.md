# LeLab SO-101 UX study and VISTA implementation

Reviewed 2026-11-20. Source reference: local `huggingface/leLab` clone at
`84b6251cec3471195dfa35119827fbd1da2a801e`, remote `huggingface/leLab`.
The local checkout already had uncommitted changes in `lelab/calibrate.py`,
`lelab/teleoperate.py`, `tests/test_teleoperate.py`, and an untracked
`lelab/utils/serial_ownership.py`. It was read only and left unchanged. Findings
below distinguish the checked-out working tree from a clean upstream release.

The checkout contains a yellow mascot image but no connection, calibration, or
teleoperation screen captures. I inspected that asset and did not use it as a
screen reference; the implementation follows the source components and styles.

## What the source does

- `frontend/src/pages/Calibration.tsx` is a dedicated dark, full-height
  calibration workspace. It selects a robot side (LeRobot device types
  `teleop`/leader and `robot`/follower), selects a serial port, links an existing
  calibration file or starts a new one, and shows live status/ranges with
  explicit stop and step-complete controls. Calibration state polls at 200 ms.
  Camera setup is a separate part of that page and is not part of this VISTA
  robot setup flow.
- `lelab/calibrate.py` connects the selected LeRobot leader/follower with
  `calibrate=False`, disables torque, sets position operating mode, resets
  calibration, reads the neutral encoder positions, calculates half-turn
  homing offsets, and writes those offsets. It then records the operator's
  manual joint sweep at 20 Hz, rejects invalid readings and encoder wrap jumps,
  validates non-zero ranges, and saves `MotorCalibration` through the LeRobot
  device. A range under 100 encoder counts is a warning in LeLab, not a hard
  failure. Its stop path disconnects the device.
- `frontend/src/pages/Teleoperation.tsx` is a full-screen visualizer with a
  camera panel on the right. It requests stop on the back button, unmount, and
  browser `pagehide`. `lelab/teleoperate.py` owns the Leader/Follower pair and
  streams joint updates while teleoperation is active.
- `lelab/utils/config.py` separates saved profiles for leaders and followers;
  leader files are under `calibration/teleoperators/so_leader`, follower files
  under `calibration/robots/so_follower`. `frontend/src/pages/Calibration.tsx`
  can list/link those saved profiles.
- The LeLab local working tree also contains a VISTA-oriented shared serial
  ownership lock in `lelab/utils/serial_ownership.py`. Its lock file is keyed by
  SHA-256 of the serial port and placed below `VISTA_HARDWARE_LOCK_DIR` (default
  `/tmp/vista-hardware-locks` on POSIX). This is a dirty working-tree addition,
  not represented by the inspected LeLab commit.

The LeLab source is Apache-2.0. VISTA did not copy LeLab source files, page
components, screenshots, or unrelated recording/training/dataset features.
VISTA's own SO-101 model and mesh attribution remains in its existing
`renderer/assets/so101/NOTICE.md`.

## VISTA mapping

| LeLab pattern | VISTA implementation |
| --- | --- |
| Side-specific Leader and Follower selection | Separate serial selectors and profile IDs on the SO-101 station screen. Duplicate port assignment is rejected. |
| Port scanning and explicit selection | `pyserial` discovery from the signed-in local Edge Runtime; empty discovery remains empty. A USB description heuristic is labeled as such. |
| Live connection state and clean disconnect | Separate local LeRobot leader/follower adapters, readback status, errors, and per-role disconnect. LeRobot's `connect(calibrate=False)` is used. The UI warns that connection can configure communication registers. |
| Calibration step status and live encoder ranges | Edge `CalibrationWorkflow`: neutral homing capture, then the actual LeLab manual range-recording sequence. UI requires an operator-supervision acknowledgement and a second confirmation before it can start. Stop disconnects and incomplete runs are never marked calibrated. |
| Save and link existing calibration IDs | LeRobot writes its normal calibration profile. The UI lists role-scoped JSON profiles from `HF_LEROBOT_CALIBRATION` (default `~/.cache/huggingface/lerobot/calibration`) and reuses a selected profile ID. On connect, the LeRobot driver's own calibrated flag controls whether measured readings are exposed. |
| Full-screen visualizer and live values | VISTA retains its existing URDF/STL Digital Twin and shows six local, read-only measured joint values on the SO-101 station screen. The authorized Twin viewer still uses its attempt-bound backend scope. |
| Teleoperation stop on exit | A Stop / disconnect-both action is provided. Physical Start stays disabled: VISTA has no student-authorized physical send-action/deadman contract. No server-only telemetry route is called. |

The VISTA screen keeps the existing sidebar, authentication, and dark VISTA
theme; LeLab's full-screen teleop canvas/camera layout is not copied. Camera
configuration, recordings, training, inference, and datasets are outside this
requested integration.

## Verification and limits

- `python3 -m unittest edge.tests.test_runtime edge.tests.test_calibration_workflow edge.tests.test_serial_ownership` uses fake ports and a fake LeRobot device only. It does not open serial hardware or move a robot.
- `npm run typecheck` verifies the source JavaScript syntax.
- `npm run smoke` covers the existing Electron renderer journey and the SO-101
  station in browser-demo mode. The browser fixture reports no serial ports,
  no connected device, no profiles, and no calibration success. It asserts
  that calibration stays disabled without an operator acknowledgement and a
  discovered port, and that physical teleoperation remains disabled.
- Local browser screenshot: `/tmp/vista-desktop-smoke/robot-connection-calibration.png`.
- Physical hardware acceptance is **BLOCKED**: no supervised Leader/Follower
  hardware session was run. LeRobot is optional and is not part of
  `requirements-edge.txt`; the currently described Edge build is Python 3.11,
  while the available CHECKIK environment used for prior inspection is Python
  3.12 with LeRobot 0.6.2. Portable, three-OS LeRobot packaging and a locked
  dependency set remain unresolved. The new driver paths report an honest
  unavailable/error state when those APIs are absent.
- Physical teleoperation is **NOT IMPLEMENTED / BLOCKED** pending a VISTA
  student/attempt authorization contract, a supervised deadman and stop design,
  compatible LeRobot packaging, and hardware acceptance. The UI does not issue
  motion commands.
- Hardware prerequisites for a supervised calibration: one Leader and one
  Follower on distinct supported serial adapters, device permissions/drivers,
  a collision-free work area, an operator able to move each arm manually with
  torque disabled, and LeRobot installed in the Edge Runtime's own Python.
