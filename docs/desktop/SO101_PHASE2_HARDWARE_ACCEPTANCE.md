# SO-101 Phase 2 hardware acceptance checklist

## Current software boundary

- Fake teleoperation has two isolated virtual pairs (`pair-a`, `pair-b`). It does not open serial ports.
- The physical Edge adapter exposes four independently assigned read-only slots: Leader A, Follower A, Leader B, Follower B.
- `fakeRobot=true` and `hardwareEnabled=false`. There is no physical follower `send_action` path in VISTA. Do not infer hardware motion readiness from a passing mock test.
- The optional hardware dependency target is LeRobot `0.6.1` with the Feetech extra (`requirements-edge-robot.txt`). The adapter imports public `SO101Leader`/`SO101Follower` APIs and allows the signature-checked `0.6.2` source installed in this development host. The Edge venv used for mock tests has no LeRobot package; LeRobot is not part of the default packaged Edge Runtime. No SO-101 was attached here.
- Read-only API check on this host confirmed `connect(calibrate=False)`, Leader `get_action()`, Follower `get_observation()`, `disconnect()`, and configs with `use_degrees=True`. The calibration adapter's motor-bus helpers exist in LeRobot 0.6.2, including `_get_half_turn_homings` (private API); this remains a compatibility risk requiring real-device acceptance before use.
- Firmware compatibility is reported `UNVERIFIED`; USB descriptors are only a discovery heuristic. VISTA does not assume motor IDs or configure motor IDs.

## Supervised acceptance, one arm at a time

Do not begin until the lab owner has authorized physical acceptance, the arm is mechanically inspected, the workspace is clear, and an accessible power disconnect is identified. Keep the arm mechanically supported and hands clear of pinch points. Use the vendor/LeRobot setup documentation for hardware assembly and motor-bus configuration.

1. Record OS, USB adapter, LeRobot version, arm serial/label, device ID, and firmware information reported by the hardware. Do not assign one serial port to two slots.
2. Start with `hardwareEnabled=false`. Scan ports and compare the unplugged/plugged list; a “likely robot” match alone is not device identification.
3. Assign one port to one slot. Connect in read-only mode, confirm the selected device identity, inspect all six named joints, units, freshness, and disconnection behavior. Stop on a missing/extra joint, unexpected direction, non-finite value, timeout, or identity ambiguity.
4. Verify the correct role-specific LeRobot calibration profile is present for that device ID. Never copy another arm’s calibration. Run guided calibration only with the vendor-approved pose/range procedure and an operator supervising the arm. Verify save and disconnect; reload the same profile and verify the driver’s calibrated flag.
5. Repeat steps 2–4 independently for Leader A, Follower A, Leader B, and Follower B. Confirm duplicate port assignment is rejected and disconnecting one slot does not affect the other three.
6. Exercise USB removal, runtime termination, application shutdown, and reconnect. The expected behavior is an error/disconnected state, serial lock release, no command replay, and no automatic motion resume.
7. Only after separate safety review and explicit project-owner approval may a later change enable a physical teleoperation loop. This Phase 2 implementation does not enable or acceptance-test physical motion.

## Evidence to record

- OS and USB serial adapter models; LeRobot and Feetech SDK versions.
- One mapping row per arm: slot, physical label, port, LeRobot device ID, calibration profile, and observed firmware information.
- Calibration status and logs for each arm, including failed attempts.
- Mock test output and observed results for connect/disconnect, duplicate-port rejection, joint schema/finiteness, and shutdown.
- Explicit sign-off for any future physical command path. A mock test is never evidence of `PHYSICAL_ROBOT VERIFIED`.
