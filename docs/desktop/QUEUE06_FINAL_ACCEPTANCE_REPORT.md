# Queue 06 — Final Desktop regression and commissioning readiness

**Date:** 2026-11-28
**Repository:** `vista-lab-station`
**Branch:** `codex/final-overnight-completion`
**HEAD:** `c5f4bce` (tracks `origin/codex/final-overnight-completion`)
**Scope:** One SO-101 leader/follower Desktop candidate. No merge, deployment, AWS action, backend/Web edit, Production access, or physical robot operation.

## Acceptance summary

The Desktop source candidate passed its applicable local regression suites, runtime contract tests, type/syntax checks, renderer build, and browser Demo smoke. This is a candidate for an owner-supervised commissioning session after the owner supplies the missing hardware/software prerequisites. It is not a physically verified or armed robot release.

| Area | Status | Evidence / limitation |
|---|---|---|
| Connection and serial discovery | MOCK-VERIFIED | Python runtime and ownership tests cover explicit role/port selection, duplicate-port rejection, locks, disconnect and cleanup. No real serial discovery or connection. |
| Calibration | MOCK-VERIFIED | Schema, role, confirmation, cancellation, existing-profile preservation and cleanup tests pass. No calibration file was read from a real device or written. |
| Physical adapter | MOCK-VERIFIED | Injected LeRobot-shaped adapters exercise observation/action, mapping, safety sink and cleanup. Installed LeRobot 0.6.1 and actual device compatibility remain unverified. |
| Teleoperation and runtime safety | MOCK-VERIFIED | Fake/synthetic tests cover explicit arm/deadman, ownership, stale/invalid/limited commands, watchdog, stop, disconnect and reconnect fail-closed behavior. Physical motion is gated off. |
| Digital Twin | MOCK-VERIFIED | Local MuJoCo and validated fixture/frame contracts pass; physical telemetry and the owner Web Twin are not verified. |
| Edge/MQTT lifecycle | MOCK-VERIFIED | Local fake-broker contract covers authorization default-deny, command identity, ACK/status, dedupe, telemetry freshness/sequence, stop/disconnect and expiry behavior. No live MQTT/AWS. |
| Evidence | MOCK-VERIFIED | Local schema/integrity and API contract checks pass. No backend/S3 persistence confirmation occurred; physical upload remains owner/backend dependent. |
| Recording | MOCK-VERIFIED | Local measured-frame lifecycle, ordering, metadata, sealing, recovery and cancellation pass. Command traces and a guaranteed session/outcome association are not available from all current sources. |
| Simulation replay | MOCK-VERIFIED | Preview lifecycle, selection, pause/speed/end/cancel and corrupt-frame rejection tests pass. No physical replay. |
| Desktop UI | MOCK-VERIFIED | Browser Demo smoke and screenshot/source review pass. UI remains explicit that fake/simulation paths are nonphysical and hardware output is disabled. |
| Physical leader/follower pair | NOT RUN | No hardware interaction in this task. |
| Physical safety certification | NOT RUN | Software tests do not certify physical stop/watchdog/safe-hold behavior. |

## Regression evidence

- `npm test`: **48 passed, 0 failed** (26 API/Electron IPC contract checks and 22 Node subtests; test runner configured for one worker).
- `edge/.venv/bin/python -m unittest discover -s edge/tests -p 'test_*.py' -v`: **100 passed, 0 failed** in one process. Covers serial ownership, connection and calibration, adapter/runtime, teleoperation, safety/watchdog, Twin/MuJoCo, MQTT lifecycle and local evidence fixture.
- `npm run typecheck`: passed JavaScript syntax checks. There is no TypeScript compiler or TypeScript source configured.
- `npm run build:renderer`: passed; generated `renderer/app.bundle.js`.
- `timeout 75s npm run smoke`: passed in the authorized host context. It exercised Dashboard status, Demo workspace/save/version, Demo simulation/result, Twin navigation, and fake-device station controls. Screenshots are at `/tmp/vista-desktop-smoke/`. Demo fixtures only; no API mutation, hardware, or cloud verification.
- A first in-sandbox browser smoke attempt failed before launch because loopback bind was denied (`EPERM`). The authorized host-context rerun passed. This is not a product defect.
- `git diff --check`: passed at final source review. No P0 software defect reproduced in this regression. No tests were weakened.
- Installer/package build was **NOT RUN**; this task rebuilt the renderer, not Linux/Windows/macOS packages or the embedded Edge binary.

## Final UI review

The browser smoke and source review covered station/runtime state, connection/calibration affordances, fake teleoperation state, Twin navigation, and recording/replay controls. Device roles are explicit, physical motion remains disabled with the current safety configuration, software stop is called out separately from the physical E-stop, replay is labeled visualization-only, and evidence upload controls require a verified physical follower recording. Runtime states distinguish simulation/mock/unverified data from physical operation. The smoke did not authenticate to a live Education backend, open a physical calibration workflow, or validate a live Twin session. The empty viewer region in the station smoke is expected until a frame is loaded.

## Repository and full working-tree review

The branch remains at `c5f4bce`, tracking its origin branch. No files are staged and no commits were created. The complete pre-documentation worktree diff was reviewed; all pending changes correspond to Queues 02–05 in this session:

**Present before Queue 05 (Queues 02–04):** `edge/calibration.py`, `edge/mqtt_transport.py`, `edge/runtime.py`, `edge/tests/test_calibration_workflow.py`, `edge/tests/test_mqtt_transport.py`, and the existing untracked persistent reports `docs/desktop/QUEUE01_DESKTOP_CLOSEOUT.md`, `docs/desktop/QUEUE04_CLAUDE_INTEGRATION_HANDOFF.md`, `docs/desktop/SO101_SUPERVISED_TELEOP_CHECKLIST.md`.

**Queue 05 work:** `main.js`, `package.json`, `preload.js`, `recording-manager.js`, `renderer/app.js`, generated `renderer/app.bundle.js`, `tests/recording-manager.test.cjs`, `renderer/recording-playback.js`, and `tests/recording-playback.test.cjs`.

**Queue 06 documents:** this report, `SO101_ONE_PAIR_FINAL_COMMISSIONING_RUNBOOK.md`, and the Queue 01–06 checkpoint update below. Existing files above were preserved. No shared contract, Claude-owned backend/Web/Terraform, external R1, or unrelated implementation file was modified.

## Readiness and blockers

- **Connection readiness — BLOCKED for physical commissioning.** Software path is MOCK-VERIFIED; no active LeRobot installation/version, physical ports, role identity, permissions, USB-loss or serial-health check is available.
- **Calibration readiness — BLOCKED for physical commissioning.** Software validation/reuse guards pass; actual calibration files and device readback were not verified. Existing valid profiles remain protected from overwrite.
- **Teleoperation readiness — BLOCKED for physical motion.** Physical output stays disabled by default. Owner-approved joint/rate/pose limits and a verified hardware stop/hold path are absent. No auto-home, auto-alignment, or reconnect resume is allowed.
- **Physical adapter readiness — MOCK-VERIFIED at the adapter seam; physical compatibility NOT RUN.** LeRobot 0.6.1 is pinned in source but is not installed in the available active environment.
- **Digital Twin compatibility — MOCK-VERIFIED for the six-joint Desktop/MuJoCo schema; physical live telemetry NOT RUN.** The external Web viewer is not Desktop-owned and was not changed.
- **Edge Runtime compatibility — MOCK-VERIFIED locally against the approved contract shape; live runtime/backend authorization BLOCKED.** Default command authorization denies; MQTT was not connected.
- **IoT handoff readiness — BLOCKED.** The identity handover procedure is documented in the Queue 04 handoff/runbook but was not executed. R1 and Desktop must not run concurrently under the same identity. No AWS resources or Production identity were accessed.
- **Recording and replay — MOCK-VERIFIED locally.** Recording captures measured frames; action traces are not supplied by current joint-state reads. Simulation replay is visual only. Physical replay is out of scope.
- **Evidence — MOCK-VERIFIED locally; persistence NOT RUN.** No API/S3 upload or storage confirmation occurred. Backend/Claude must bind attempt/session/outcome and confirm persistence. Simulation/mock evidence is never classified as physical.

### Exact owner actions before supervised one-pair operation

1. Install/select and report the actual LeRobot 0.6.1 Robotics environment plus Feetech and pySerial versions.
2. Provide the physical pair and an owner-supervised session; identify leader/follower by physical cable trace and explicit stable IDs; verify serial permissions and existing role-specific calibration files.
3. Supply and approve robot-specific joint position/velocity limits, initial-pose tolerance, command rate, stale threshold, watchdog and safe-stop/hold behavior, plus an independent physical E-stop procedure. Without this configuration, stop before arming.
4. Supervise any required calibration separately for leader and follower and approve backups. Never overwrite a valid profile without owner approval.
5. Authorize the exact low-risk teleoperation trial and supervise it at the physical E-stop; verify explicit stop, disconnect, fault latching and no motion after reconnect.
6. If WF03/cloud is in scope, separately authorize a sole-owner R1/Desktop identity handover and approved non-Production test window. Do not access Production with an already active device identity.

### Exact Claude/backend integration dependencies

See [Queue 04 Desktop-to-Backend handoff](QUEUE04_CLAUDE_INTEGRATION_HANDOFF.md). Claude/backend must confirm the API-issued authorization boundary and attempt/session binding; cancellation/stop semantics and terminal lifecycle event; session expiry behavior during execution; whether Desktop has any approved AWS simulation role; the physical MQTT executor/adapter contract if ever authorized; and backend evidence/S3 binding and persistence confirmation. No new endpoints, topics, identities, or shared-contract edits were introduced.

## Deferrals

Dual-arm physical operation, physical VLA execution, physical trajectory replay, simulation-to-recorder MuJoCo frame integration, command-action trace recording, live cloud/WF03 acceptance, Web Twin changes, installer rebuild/clean-install acceptance, and backend/S3 evidence persistence remain deferred or separately owned. Queue 06 adds no features.

## Final disposition

**Desktop candidate ready for supervised one-pair commissioning preparation, not yet ready for physical motion.** Continue only after the owner actions and safety configuration above are complete. No physical connection, calibration, motor activation, movement, AWS/Production access, deployment, merge, or commit was performed.

## Final pre-commissioning gate — 2026-11-28

### LeRobot environment readiness

| Environment | Observed state | Commissioning verdict |
|---|---|---|
| System/base `python3` | Python 3.14.6; imports LeRobot 0.6.2 from `/home/quangduc/lerobot/src`; SO-101 leader/follower/Feetech modules import, but Feetech distribution metadata and MuJoCo are absent. | NOT COMPATIBLE with project-pinned Python 3.12 / LeRobot 0.6.1; not selected by Desktop. |
| Conda `lerobot` | Python 3.12.13, LeRobot 0.6.2, Torch 2.11.0, NumPy 2.2.6, pySerial 3.5, `feetech-servo-sdk` 1.0.0 / `scservo_sdk` present; SO-101 classes/config imports and adapter method names (`connect(calibrate=False)`, leader `get_action`, follower `get_observation`/`send_action`) import. MuJoCo is missing. | NEARBY API-SHAPED ENVIRONMENT, but NOT COMPATIBLE with exact Desktop preflight pins; do not select for physical use. No device was opened. |
| Clean user-local Python 3.12.14 | No LeRobot, Feetech SDK, pySerial, NumPy, Torch or MuJoCo packages. | NOT READY. |
| Desktop `edge/.venv` | Python 3.11.16, PyInstaller 6.19.0, MuJoCo 3.17.0, pySerial available; LeRobot, Torch and Feetech SDK absent. | Simulation runtime build/test environment only; not physical Robotics profile. |

No LeRobot 0.6.1 environment is installed. `main.js` Robotics profile preflight requires Python 3.12, Torch 2.7.1+cpu, CUDA absent, LeRobot 0.6.1, NumPy 2.2.6 and MuJoCo 3.17.0, plus successful SO-101 leader/follower imports. The existing pinned isolated environment is `edge/robot-runtime/pyproject.toml` + `uv.lock`; it includes `lerobot[feetech]==0.6.1`, `pyserial==3.5`, `torch==2.7.1+cpu`, `torchvision==0.22.1+cpu`, `numpy==2.2.6`, `mujoco==3.17.0`, `paho-mqtt==2.2.0`, PyInstaller and build tooling. No package was installed into system Python or the existing Conda environments.

**Minimum isolated setup for the owner/operator:** from the repository root, run `uv sync --project edge/robot-runtime --locked --python 3.12`; verify `uv run --project edge/robot-runtime --locked python -c "import sys, torch, numpy, lerobot, mujoco, serial; from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig; from lerobot.teleoperators.so_leader import SO101Leader, SO101LeaderConfig; print(sys.version, lerobot.__version__, torch.__version__, numpy.__version__, mujoco.__version__)"`. Select the resulting `edge/robot-runtime/.venv/bin/python` and this VISTA source root in Desktop Runtime Settings. This is a locked isolated install procedure only; it was not run here. It does not authorize serial connection or motor writes.

Packaged simulation differs from optional robotics mode: the packaged Desktop launches its bundled PyInstaller Edge executable; optional Robotics mode requires an operator-selected external Python executable and a source tree containing `edge/runtime.py`. No live LeRobot readiness is inferred from the packaged runtime.

### Ubuntu packaging and launch

- **PASS** `VISTA_EDGE_PYTHON=edge/.venv/bin/python npm run dist` built the current package (0.1.1) sequentially for Ubuntu x64: PyInstaller Edge Runtime, Electron renderer, AppImage, and DEB. Existing stale 0.1.0 ignored artifacts were left in place; new outputs are ignored local build artifacts and were not published.
- DEB metadata: `vista-lab-station` 0.1.1 `amd64`, Installed-Size 484225 KiB; SHA-256 `8dd57ef5db0a1832606ec497fa0932d8b3aafd79b2d822631a5cf2aa4907aef7`. AppImage SHA-256 `d32720041817dc43d77d81cfe49758fe1e6c71e7c6527fa1208033053a774768`.
- **PASS** extracted the DEB under `/tmp/vista-precommissioning-deb` without installing it system-wide. Verified `app.asar`, bundled `edge-runtime/vista-edge-runtime`, SO-101 `scene.xml` in Desktop and runtime resources, and `so101_new_calib.urdf` in the runtime bundle.
- **PASS** packaged Edge binary protocol health/status/disconnect: Python 3.11.16 bundled, Simulation `READY`, MuJoCo available, `motionEnabled=false`, `hardwareEnabled=false`, fake robot enabled; LeRobot unavailable in that binary as expected for Simulation.
- **PASS** extracted packaged Electron executable under Xvfb with `VISTA_DESKTOP_DEMO=1`; native Demo login, workspace/save/version/result and packaged Simulation Runtime profile smoke passed. Runtime diagnostics reached `simulation · ready`; hardware output stayed disabled. No API, cloud, MQTT or physical device was accessed.
- PyInstaller warned optional OSMesa/OpenGL acceleration modules were absent. Packaged Demo and MuJoCo readiness passed. Filament/onscreen camera rendering and optional OSMesa rendering were not a package acceptance target and were not separately exercised.

### Exact physical safety configuration still missing

| Required safety input | Current Desktop state | Required before any arm/action |
|---|---|---|
| Device/robot identity | Adapter stores operator-selected role, profile/device ID and port; robot UUID/controller ID are separate execution identities. No physical device IDs have been verified. | Owner traces cables and confirms distinct leader/follower device IDs, roles, calibration IDs, approved robot UUID and controller/runtime identity. Never infer from port order. |
| Calibration | Independent leader/follower LeRobot profiles are validated locally and protected from overwrite. No target calibration file/device readback was checked. Calibration bus writes require the maintenance/hardware authorization path. | Owner verifies existing role-specific profiles; if absent/invalid, separately supervises calibration, backups and readback. Never fabricate/overwrite valid calibration. |
| Joint limits | `LeRobotSO101Adapter` requires six named position bounds but defaults to none. | Owner supplies approved position envelope for `shoulder_pan`, `shoulder_lift`, `elbow_flex`, `wrist_flex`, `wrist_roll`, `gripper`, with units and calibration mapping. Fake/MuJoCo constants are not physical limits. |
| Velocity/command rate | Physical adapter requires six per-joint velocity limits but defaults to none. Physical command-rate limit is not configured. | Owner supplies per-joint velocity limits and maximum command rate/timing policy from approved hardware documentation. |
| Watchdog | Local controller software defaults: command watchdog 0.25 s, runtime heartbeat timeout 2 s; fake teleoperation input age 0.150 s and minimum command interval 0.040 s. These values are code/test defaults, not verified hardware safety settings. MQTT Shadow heartbeat ≤10 s is a separate reporting contract. | Owner approves physical stale-command/watchdog response and confirms behavior on the actual adapter/actuators under supervision. Do not adopt fake timing as a hardware limit without approval. |
| Software Stop | Local Stop latches the software safety controller, clears leases, cancels local simulation/fake execution, and attempts an adapter `safe_stop` callback if configured. Physical adapter requires a callback but none is configured; there is no physical stop guarantee. | Configure and verify only an approved hardware-specific stop/hold action before enabling any physical writes. |
| Independent physical stop | No physical E-stop was inspected or tested. | Owner confirms an independent physical E-stop exists, is reachable, and its hardware procedure is verified; software Stop is not a substitute. |
| Safe shutdown/reconnect | Runtime attempts to stop, latch faults and disconnect every adapter; software tests cover cleanup. Hardware stop/hold and physical reconnect behavior are unverified; defaults prevent arming and automatic resume. | Owner verifies stationary shutdown, actuator stop/hold, cable loss, disconnect, app/runtime termination, lock release and explicit re-arm after reconnect. |

Physical motion remains **BLOCKED**. There is no approved physical position/velocity/rate profile or verified hardware safe-stop callback, no verified target pair/calibration, and no physical E-stop/shutdown evidence. Do not turn off the fail-closed defaults to bypass these gates.

### Claude handoff and current git disposition

See [CLAUDE_DESKTOP_INTEGRATION_HANDOFF.md](CLAUDE_DESKTOP_INTEGRATION_HANDOFF.md) for existing API/MQTT contracts, expected versus actual Desktop behavior, confirmed incompatibilities, unverified assumptions and Claude-side questions. It preserves the §12 Desktop physical-owner / R1 simulation-only rule and requires backend authorization/session binding, stop/expiry/cancellation semantics, physical telemetry ownership and evidence persistence confirmation.

At the start of this gate, the tracked changes were the pending Queues 02–05 implementation plus Queue 06 reports, all on branch `codex/final-overnight-completion` at `c5f4bce`; no separate unrelated owner file change was found in the diff. This gate adds documentation only. Focused commits stage only the Queue 02–06 paths listed above; ignored build outputs remain outside Git. The branch history records the resulting local commits.
