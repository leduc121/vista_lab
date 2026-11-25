# VISTA SO-101 Hardware Commissioning Runbook

Status: preparation only. No hardware was connected or commanded while preparing this document.

## 0. Preconditions

Do not start until the project owner approves the named commissioning session and an operator is present at the robot. Confirm each arm is mechanically secured, the work area is clear, the operator can reach the power disconnect, and the hardware emergency stop works independently of VISTA. Keep `fakeRobot=true` and `hardwareEnabled=false` until a later, separately approved change.

The current Linux RC is Python 3.11.16 and does not bundle LeRobot. A separate Python 3.12.14 CPU profile now imports and initializes LeRobot 0.6.1 Leader/Follower objects with fake paths, reports them disconnected, and passes runtime/mock checks; see [Robotics Runtime Compatibility](ROBOTICS_RUNTIME_COMPATIBILITY.md). The packaged Desktop supervisor does not yet select this external profile, so do not perform physical connection/calibration through the RC. `connect(calibrate=False)` is not read-only in LeRobot 0.6.1: the SO-Follower implementation calls `configure()`, which writes operating mode, PID coefficients, and gripper protection values.

## 1. Read-only host and port discovery

These commands inspect USB enumeration and filesystem permissions only; they do not open serial buses or write to motors:

```bash
date -Is
uname -a
python3 --version
id
groups
lsusb -nn
find /dev/serial/by-id -maxdepth 1 -type l -printf '%f -> %l\n' 2>/dev/null | sort
find /dev -maxdepth 1 \( -name 'ttyACM*' -o -name 'ttyUSB*' \) -printf '%p\n' | sort
```

With one controller USB cable changed at a time, take a before/after listing to associate its USB adapter with a port. Do not infer arm role or identity from `likelyRobot`, vendor text, or `/dev/ttyACM*` numbering. Record the physical label and port in the table below. When available, inspect a candidate without opening it:

```bash
udevadm info --query=property --name=/dev/serial/by-id/REPLACE_WITH_DISCOVERED_DEVICE
stat -c '%A %U:%G %n' /dev/serial/by-id/REPLACE_WITH_DISCOVERED_DEVICE
```

Use a stable `/dev/serial/by-id/...` path where the device exposes one. Do not use `sudo chmod 666`, do not run VISTA as root, and do not unplug a bus while a driver owns it.

| Slot | Physical label | Discovered stable path | USB VID:PID / serial | LeRobot identity | Calibration profile |
| --- | --- | --- | --- | --- | --- |
| Leader A |  |  |  | `leader-a`-specific |  |
| Follower A |  |  |  | `follower-a`-specific |  |
| Leader B |  |  |  | `leader-b`-specific |  |
| Follower B |  |  |  | `follower-b`-specific |  |

Never assign one port or one calibration profile to two arms. Do not assume motor IDs are correct because the upstream SO-101 profile lists IDs 1–6; verify the actual device configuration before using it.

## 2. Calibration writes — separate approval required

Calibration is not part of read-only discovery. Before any calibration command, obtain an explicit owner approval covering the arm(s), operator, time window, permitted bus writes, and abort procedure. Keep each arm physically supported and calibrate one arm at a time.

LeRobot 0.6.1 calibration may disable torque, set operating mode, set homing offsets and joint ranges, persist calibration to the motor bus, and save a local profile. `lerobot-setup-motors` changes motor IDs/baud rate and is excluded from this runbook; do not run it unless the owner approves a separate motor-setup task and the hardware configuration is independently documented.

VISTA's current RC blocks physical calibration by default. Do not bypass the gate or invoke private LeRobot motor-bus APIs. Use the approved LeRobot version's documented calibration path only after its Python 3.12 runtime is installed and validated. Preserve a per-arm calibration backup and record its SHA-256 before and after the operation.

## 3. Actuator writes and motion — separate approval required

No actuator-write command is authorized by this runbook. `send_action`, teleoperation, replay, test programs that write `Goal_Position`, or any operation that can move an arm require a later explicit owner approval after calibration, joint limits, velocity limits, safe-stop behavior, and physical E-stop have been reviewed. Do not use these commands during discovery or calibration acceptance.

The physical teleoperation authorization remains fail-closed. No robot movement has been verified. Software E-stop does not replace the hardware emergency stop. Do not resume motion after a disconnect or E-stop without a new explicit arm sequence.

## 4. Acceptance order after approval

1. Complete read-only discovery and owner sign-off on all four identity/port rows.
2. Approve and calibrate one arm at a time; verify the saved profile belongs to that device and role, then disconnect it.
3. Repeat for Leader A, Follower A, Leader B, and Follower B. Confirm duplicate port assignment is rejected.
4. Approve a no-motion joint-state read for one arm at a time. Confirm six expected named joints, units, finite/fresh values, and disconnect handling.
5. Verify physical E-stop and approved safe-stop behavior before any command test.
6. Only with a new owner approval, test one follower at a time at the minimum approved command/rate/range. Test disconnect and E-stop before Leader–Follower teleoperation. Do not start dual-arm motion until each single-arm pair passes independently.
7. Record software versions, USB identity, profile hash, safety events, and operator sign-off. Mark physical status only for steps actually observed on the physical arms.

## 5. Software-only checks (no serial access)

The existing injected mock path can be rechecked without a device:

```bash
cd vista-lab-station
edge/.venv/bin/python -m unittest \\
  edge.tests.test_runtime.RuntimeTests.test_mock_lerobot_send_action_runs_inside_safety_sink -v
```

This verifies the mock `send_action` call is inside the LocalSafetyController sink. It does not validate LeRobot's real import in the packaged runtime or physical output.
