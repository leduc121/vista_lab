# VISTA SO-101 Supervised Commissioning Runbook

**Status: PREPARED — NOT PHYSICALLY ACCEPTED.** No serial port was opened and no hardware was connected, calibrated, armed, or moved in this session. The procedure below is for one supervised SO-101 follower pair only. Owner approval is required before physical connection, calibration writes, arming, motion, or any Cloud physical mode.

## Scope and current readiness

- The Desktop Edge source contains a LeRobot 0.6.1/0.6.2 SO-101 leader/follower adapter, named measured-joint mapping, interprocess serial ownership, safety-gated follower output, and disconnect cleanup. Synthetic adapter and Safety Controller tests pass. This is **IMPLEMENTED / SYNTHETICALLY TESTED**, not physical acceptance.
- The packaged Ubuntu `0.1.1` DEB's default bundled runtime is simulation-first. The optional pinned physical environment is [edge/robot-runtime/pyproject.toml](../../edge/robot-runtime/pyproject.toml): Python 3.12, `lerobot[feetech]==0.6.1`, CPU Torch 2.7.1, MuJoCo 3.17.0, pyserial 3.5 and locked dependencies. The connected host must select this environment and the authorized Edge source checkout in Desktop Settings. The package alone is **not** standalone physical-robot support.
- The serial adapter's `connect(calibrate=False)` still invokes LeRobot `connect()` and may configure/write device settings. Treat it as an owner-approved hardware operation. The default runtime leaves hardware connection authorization false; physical output also fails closed until real limits, calibration, an owner-authorized sink and a verified safe-stop strategy are supplied. Do not bypass those gates.
- Registered local scope retains two leader/follower pairs (`leader-a`/`follower-a` and `leader-b`/`follower-b`). Only one pair may be selected for tomorrow's physical session. Existing Cloud identity, queue, Twin owner and telemetry schema support **one follower only**. Dual-arm local wiring is not dual-arm Cloud acceptance, and the second follower must remain disconnected from the Cloud path.
- Cloud Phase A is not accepted: AWS certificate/mTLS and Shadow freshness are unverified, and the deployed Production Edge publisher has telemetry-envelope and idle-heartbeat gaps documented in [AWS Acceptance Runbook](AWS_ACCEPTANCE_RUNBOOK.md). Do not enable Phase B or claim Cloud physical readiness.

## Before the operator arrives

1. Confirm the session owner, responsible operator, time window, single follower pair and approved task. Obtain separate written approval for device connection/configuration, calibration writes and motion. General project approval does not authorize motion.
2. Use the existing Ubuntu amd64 workstation and authorized source checkout. Verify the selected Python is 3.12 and the environment matches the pinned `edge/robot-runtime/pyproject.toml`/`uv.lock`. If the environment is absent or mismatched, stop; do not improvise versions during the session.
3. Keep `fakeRobot=true` and `hardwareEnabled=false` until an explicit local operator workflow authorizes the specific step. Keep MQTT/Production Cloud flags off during local commissioning.
4. Verify the physical emergency stop, power disconnect, supports, clear work area and operator reach before connecting motors. Confirm only one supported controller process owns the follower; do not launch CHECKIK, a second VISTA runtime, or another teleop app against the same port.
5. Do not expose student credentials, AWS credentials or private keys on the commissioning screen. Do not start with a queued command or replay.

## Step A — identify hardware without opening a serial session

With the owner present, enumerate devices before and after connecting one USB cable at a time. These commands inspect the host and do not open a serial protocol session:

```bash
date -Is
uname -a
python3.12 --version
id
groups
lsusb -nn
find /dev/serial/by-id -maxdepth 1 -type l -printf '%f -> %l\n' 2>/dev/null | sort
find /dev -maxdepth 1 \( -name 'ttyACM*' -o -name 'ttyUSB*' \) -printf '%p\n' | sort
```

Record the owner-identified **one** leader and follower paths and physical labels. Prefer stable `/dev/serial/by-id/...`; never guess a port from enumeration order or `likelyRobot`. Check whether another process owns the chosen path before VISTA opens it. Never use `sudo chmod 666`, run VISTA as root, or unplug a device while its owner has the port.

| Pair | Role | Slot | Physical label | Stable path | USB VID:PID / serial | Existing profile identity |
|---|---|---|---|---|---|---|
| A (tomorrow's scope) | Leader | `leader-a` |  |  |  |  |
| A (tomorrow's scope) | Follower | `follower-a` |  |  |  |  |
| B (registered local scope; not selected tomorrow) | Leader | `leader-b` |  |  |  |  |
| B (registered local scope; not selected tomorrow) | Follower | `follower-b` |  |  |  |  |

Do not assign the same port or profile to multiple roles. The unused pair remains disconnected. Do not report dual-arm physical acceptance unless pair B receives its own separately approved and recorded test.

## Step B — owner-approved connection and calibration

1. Reconfirm operator approval and the exact `leader-a`/`follower-a` IDs and paths. Connect only through VISTA's supported connection owner. No parallel process may own the same port.
2. LeRobot connection is not read-only. Stop if unexpected mode, torque, ID, baud, calibration, or identity changes are requested. Do not run `lerobot-setup-motors` or invoke private bus APIs.
3. Read the existing calibration/profile metadata first. If calibration is absent, stale or does not match the device, stop until a separately approved calibration-write window is granted. Support the arm, calibrate one arm at a time, preserve the pre-write profile and record before/after hashes and operator identity. Do not transfer a profile between arms.
4. Verify actual connected identity, six named SO-101 joints in contract order, units, finite/fresh measured values, and calibration readiness. Compare readback with the operator's stationary observation. A ready indicator must come from actual adapter state.

Calibration changes motor state and is a separate authorization. If no valid calibration exists, today's result is **BLOCKED / NO MOTION**.

## Step C — local safety and single-follower operation

1. With the follower physically supported and no motion command queued, verify exclusive ownership and actual runtime status. Confirm hardware remains disabled until local operator authorization; no API, MQTT, Shadow desired state or startup path may arm it.
2. Verify the physical E-stop independently of the application. Verify the application E-stop latches, stops future output and requires the existing explicit local reset; reset must not re-arm. Test watchdog/communications-loss behavior using the approved safe procedure and verify reconnect does not resume or re-arm.
3. Confirm the real six-joint position/velocity limits, calibration and hardware safe-stop callback are configured for this device. If any are missing, the adapter must refuse motion. Do not infer production limits from simulation defaults.
4. Only after the owner approves a minimal physical task and motion envelope, locally arm through the operator-controlled workflow and execute one prevalidated minimal action. Keep the hardware E-stop under the operator's control. Verify measured joint state, stop, disarm, release lease and disconnect. Do not test arbitrary trajectories or cloud commands.
5. Test leader input/teleoperation only if separately approved after the single follower's no-motion checks pass. Use only pair A. Do not connect or control pair B in the same run.

**Safety Controller boundary:** all actuator writes must pass through the shared LocalSafetyController and the same exclusive owner as manual/leader-follower/MQTT control. Emergency stop overrides every source. E-stop, stale command, bad sequence, invalid joint, fault, watchdog or owner loss must stop/deny output; clearing a fault never arms. If an observed state disagrees with the report, stop and disconnect.

## Step D — measured telemetry and recording

- Record actual follower observations, not commanded targets. Preserve measured timestamp, six-joint order/units, robot identity, adapter mode, calibration, connection, fault and source provenance. Simulation values must never be relabelled as physical.
- The local adapter exposes measured `joint_state`; actual physical telemetry publication to the Production Twin has **not** been accepted. Production's telemetry bridge currently has a separate Edge contract blocker; Cloud physical mode remains disabled until the backend owner fixes and verifies it.
- Desktop upload is restricted to stopped, verified `PHYSICAL_ROBOT` recordings. Do not upload local simulation recordings through the physical recording route. Before upload, verify the existing manifest schema, episode/experiment/robot binding, file size and SHA-256; use the authenticated student API only. Confirm instructor visibility through the real application, not a mock.
- If Cloud recording or instructor review is unavailable, preserve the local recording and mark upload/review **NOT RUN**. Do not claim evidence persistence.

## Step E — separate Cloud physical commissioning (not tomorrow's default)

Cloud physical execution requires the Cloud simulation E2E to pass first and a second explicit owner approval. The existing identity/Twin contract supports one configured follower, one robot UUID and one hardware owner. `VISTA_PHYSICAL_RUNTIME_MODES=so101_follower` is valid only after the deployed Edge actually reports that adapter and genuine connection/calibration/armed/fault state. Owner must supply the exact owner identity and short UTC end time; do not invent them. Phase B flags, physical telemetry bridge and Twin owner bindings are **not** part of local physical commissioning approval.

## Stop, rollback and safe shutdown

1. Stop new commands and the approved local action. Use the verified safe-stop procedure; do not rely on terminating the process as the only stop.
2. Trigger/confirm local stop as required, disarm, clear no fault only under the approved procedure, and release the follower's control lease. Never auto-resume after disconnect or restart.
3. Stop teleoperation, disconnect leader then follower through VISTA's owner, verify the serial ownership lock is released, and shut down the Edge runtime cleanly. Confirm no active command, no pending output and no connected/armed state.
4. For a Cloud session, close MQTT, remove/disable physical commissioning only through the approved operator workflow, verify the authorization window expired, and deactivate the certificate only if approved or required by the certificate rollback checkpoint. Never make Production secret/database changes from this runbook.
5. Preserve sanitized measured telemetry, safety events, manifest and hashes. Do not delete user evidence or restore entitlements as part of cleanup.

If the owner withdraws approval, calibration is invalid, identity is ambiguous, a safety feature is absent, a fault occurs or hardware behavior differs from expectation: stop, keep the robot disarmed and disconnected, preserve evidence, and record the exact blocker. No motion is preferable to an unverified workaround.

## Software-only regression (no physical device)

```bash
edge/.venv/bin/python -m unittest \
  edge.tests.test_runtime.RuntimeTests.test_mock_lerobot_send_action_runs_inside_safety_sink \
  edge.tests.test_runtime.RuntimeTests.test_dual_physical_teleop_wiring_uses_pair_specific_leader_and_follower_safety_lease
```

These injected tests verify software boundaries and the registered pair wiring. They do not establish LeRobot connection, calibration, stop circuit, physical motion, physical recording upload, or Cloud acceptance.
