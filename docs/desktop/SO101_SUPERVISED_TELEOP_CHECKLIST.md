# SO-101 supervised one-pair teleoperation checklist

**Purpose:** Owner/operator checklist for a future supervised acceptance session. This is not authorization to connect, calibrate, arm, or move hardware. No physical teleoperation is accepted by this document.

## Before connecting

- [ ] Owner names the operator and supervisor, records date/time, station identity, Desktop commit/package hash, and approved LeRobot runtime. Current source profile pins LeRobot 0.6.1; confirm it is installed in the selected Robotics environment and record LeRobot, Feetech SDK, pySerial, Python, and OS versions.
- [ ] Owner supplies the authoritative Edge contract handoff / CX / CC references if the session crosses the external Edge/R1/cloud boundary. Confirm actual Edge process owner, source/image revision, host, install path and update mechanism.
- [ ] Confirm exactly one SO-101 leader and one SO-101 follower. Operator physically traces each USB cable and explicitly records role, stable device ID/profile ID, serial path, USB VID/PID and serial number/location when the OS provides them. Never derive roles from port order.
- [ ] Confirm both calibration files exist in their role-specific LeRobot directories, pass the Desktop schema diagnostic, match the selected profile IDs, and have owner-approved backups. Do not recalibrate or replace a profile as part of the connection check.
- [ ] Confirm clear workspace, mechanically stable mounting, cable clearance, no person in the movement envelope, and unobstructed independent physical emergency-stop access. Record who will operate that stop.
- [ ] Confirm owner-approved robot-specific joint position/velocity limits, initial-pose tolerance, command rate, stale threshold, watchdog response, and hardware stop behavior. The current Desktop repository has no approved physical safety configuration; simulation ranges are not an acceptable substitute. Without this signed configuration, stop here: arming must remain unavailable.
- [ ] Confirm current limitations: production MQTT/cloud dispatch disabled; no automatic homing or startup motion; no automatic resume after reconnect; no student actuation.

## Read-only connection checks

- [ ] Start the selected Robotics runtime and verify its diagnostic state and exact driver versions.
- [ ] Scan serial ports. Confirm exactly the expected adapters are present and permissions are adequate. If a permission, timeout, or identity error appears, disconnect and fix station setup without retrying blindly.
- [ ] Connect the leader alone with the explicit leader profile; verify connected/calibrated state and named six-joint telemetry. Disconnect and confirm its serial lock is released.
- [ ] Connect the follower alone with the explicit follower profile; verify connected/calibrated state and named six-joint telemetry. Disconnect and confirm its serial lock is released.
- [ ] Connect both selected roles and verify distinct ports/IDs, expected calibration status, finite fresh observations, and no fault. Connection alone must not create an action lease or authorize motion.

## Arming and supervised start gate

- [ ] Verify observed joint names and mapping explicitly: `shoulder_pan`, `shoulder_lift`, `elbow_flex`, `wrist_flex`, `wrist_roll`, `gripper`; confirm degrees/radians and the calibrated LeRobot gripper 0–100 convention against the exact installed version.
- [ ] Compare leader and follower measured initial poses using only the owner-approved mapping and tolerances. If compatibility fails or data is stale, do not arm. Do not align or home automatically.
- [ ] Confirm no competing controller owns the follower and inspect all runtime/safety faults. Confirm hardware remains disabled until separate, owner-approved arming action.
- [ ] Test the operator-visible software Stop with no movement first. Confirm it cancels future commands and releases ownership. Verify this software Stop is clearly separate from the independent physical E-stop; software Stop is not a substitute for the hardware E-stop.
- [ ] Before any motion trial, obtain a separate written owner go-ahead for the exact low-risk trial, limits, duration and operator. Start only with the operator holding the intended deadman control and supervisor at the physical E-stop.
- [ ] Verify telemetry, rate/velocity limit behavior, stale command rejection, watchdog, leader disconnect, follower disconnect, runtime shutdown and reconnect behavior under the approved procedure. Every fault must stop further commands, release ownership, latch/report the fault, and require explicit re-arm. Reconnect must never resume motion.
- [ ] Stop using software Stop, verify command flow ceased, then use physical E-stop if required by the approved procedure. Record logs, observed fault/status, operator and supervisor sign-off. Do not call this safety certification.

## Stop conditions

Stop the session before motion if calibration is absent/incompatible, approved safety values are missing, initial poses do not match approved tolerance, identity is uncertain, telemetry is stale/non-finite, any unexpected movement occurs, a person enters the workspace, a limit/fault occurs, or independent E-stop access is lost. Disconnect only after following the owner-approved safe shutdown sequence.

## Current status

All boxes remain unchecked. Queue 03 ran software tests against mocks only. Physical connection, calibration, motion, watchdog response on hardware, and safety certification are NOT RUN / NOT CLAIMED. The immediate block is the absent owner-approved hardware safety profile and absent installed LeRobot 0.6.1 environment.
