# VISTA Lab Station — Desktop Completion Acceptance

**Assessment:** 2026-11-23
**Scope:** Desktop repository only. No Web repository files were modified.
**Decision:** **GO for simulation-ready Desktop candidate; NO-GO for physical robot deployment or public release.**

## Acceptance matrix

| Area | Implementation and current evidence | Status / boundary |
| --- | --- | --- |
| Electron shell and navigation | Native Electron Demo workflow passed: login, Labs, attempt/workspace, save/version, schematic result, physical lock. Packaged Linux app opened under Xvfb. | **PASS** for local Demo workflow; real-backend Electron UI journey and broad accessibility review remain open. |
| Education Platform | Disposable GoTrue, Education API and PostgreSQL journey passed login/refresh, learning, assignment, attempt, Blockly save/version, schematic run/events/result, submission, projection, foreign-user denial, and independent DB readback. | **PASS** for the exercised local contracts. Temporary-password case skipped; file evidence/object storage and instructor review were not provisioned. |
| Robot connection and calibration | Role-specific discovery/configuration, guided calibration/profile workflow, errors, and safety gates are implemented and fake-device tested. | **PASS** for mock paths. No serial device or physical calibration was run; packaged LeRobot is unavailable. Windows MQTT mTLS remains locked until NTFS DACL validation is implemented. |
| Leader/follower teleoperation | Two isolated pairs, arm/deadman, watchdog, stop/reset, loss handling, bounded commands, and fake feedback passed Python, Node and Chromium acceptance. | **PASS** for fake runtime only. No physical command API is exposed. |
| MuJoCo SO-101 simulation | Six-joint scene, allowlisted execution, measured frames, authorization/confirmation, pause/cancel and policy simulation tests passed. Linux bundled runtime loaded the packaged scene under EGL and reported simulation available. | **PASS** for Linux simulation runtime. No simulator data is represented as physical measurement. |
| Digital Twin | Viewer, joint validation, freshness, provenance, no-eligible-robot state and policy Twin viewer are implemented and locally tested. | **PARTIAL**. Live attempt-authorized WebSocket was skipped in the isolated run; there is no student-authorized Desktop telemetry ingestion contract for local MuJoCo frames. |
| Trajectory library and evidence | Runtime evidence/result handling exists in the application contracts and workflows. | **PARTIAL / BLOCKED**. Recording library, playback/seek/export, evidence attachment/upload/retrieval and instructor review were not accepted end-to-end in this run. |
| ACT / SmolVLA | ACT adapter executed real CPU `select_action()` for the pinned checkpoint, as recorded in [ACT acceptance](desktop/HF_ACT_ACCEPTANCE_2026-11-22.md). Inference is isolated from action mapping. | **ACT inference-only PASS**. Joint order and units are unresolved; no ACT output may drive MuJoCo/Twin/robot. SmolVLA real inference is unverified. |
| Linux packaging | `npm run dist` completed on Linux x64 using Python 3.11.16. AppImage and DEB emitted; packaged Electron opened under Xvfb; the packaged Edge executable loaded the packaged model under EGL and shut down by protocol. | **PASS** for build and local launch/runtime smoke. Not a clean-machine install. AppImage required extract-and-run because host lacks FUSE; that wrapper needed manual termination after its window check. OSMesa is unavailable, so the OSMesa backend is not packaged. |
| Windows / macOS packaging | Configuration exists. | **NOT TESTED** on native Windows/macOS runners. |
| Physical hardware | Physical mode remains locked; no follower output path is available. | **BLOCKED** pending attached SO-101 hardware, supervised calibration/safety acceptance, and explicit authorization. |

## Verification results

| Command / check | Result |
| --- | --- |
| `npm test` | **39 passed, 0 failed** |
| `edge/.venv/bin/python -m unittest discover -s edge/tests -v` | **51 passed, 0 failed, 1 skipped**; includes MuJoCo and fake teleoperation. The Windows-only ACL fail-closed test is skipped on Linux. |
| `npm run typecheck` | **PASS** (JavaScript syntax checks; no TypeScript compiler configured) |
| `npm run build:renderer` | **PASS** |
| `npm run smoke` | **PASS**; Demo UI, workspace, save/version, result/Twin picker, Robot Station and fake-pair safety flow |
| `npm run smoke:electron` | **PASS**; native Electron Demo key journey through IPC |
| `scripts/run-isolated-lms-e2e.sh` | **PASS**, exit 0; unique disposable stack; event route passed; independent PostgreSQL readback passed. Private evidence: `/tmp/vista-lms-ae9693dc-evidence` |
| `VISTA_EDGE_PYTHON=edge/.venv/bin/python npm run dist` | **PASS**; Linux x64 AppImage and DEB |
| Packaged Linux Electron launch | **PASS** under Xvfb with sandbox enabled (unpacked output and AppImage extract-and-run) |
| Packaged Edge runtime | **PASS**; bundled scene loaded with `MUJOCO_GL=egl`, simulation available, `stop` returned safely |
| `git diff --check` | **PASS** |

The first packaged runtime probe exposed a missing PyInstaller hidden import for `OpenGL.platform.egl`, which made the packaged simulation unavailable when Electron set `MUJOCO_GL=egl`. `scripts/build-edge-runtime.py` now includes that import. The rebuilt Linux package passed the EGL runtime check.

The first PR CI matrix exposed a test-only global EGL override that failed on headless Linux and non-EGL platforms. The override was removed; camera observation unit coverage now mocks the GL renderer boundary while checking camera configuration and output schema. The full 52-case Edge suite passes locally after this correction (51 passed, one Windows-only test skipped).

The follow-up matrix found that `npm ci` could not use the stale lockfile; it now includes the missing transitive entries without changing versions of existing locked packages. Windows Python mode bits do not represent NTFS DACLs, so the MQTT client now refuses connections on Windows until explicit DACL validation exists. The native CI matrix targets Apple Silicon macOS because the pinned MuJoCo version has no Mac Intel wheel and pip would attempt a source build. The Linux-only esbuild binary is now an optional dependency; cross-platform dry runs pass for macOS ARM64 and Windows x64.

The next CI pass confirmed all three Python suites, but found a timing-sensitive Node fake-teleoperation test and the Linux-only esbuild tarball was still a required dependency. The test now sends requests interactively so it timestamps each command at dispatch, and the esbuild package is optional. A fresh native matrix is pending.

## Remaining issues

### P1 / blocked by external contract or infrastructure

- Evidence file upload/retrieval and instructor review were not exercised with object storage or the Education API.
- Authenticated live Twin WebSocket acceptance was skipped without test-owned robot/session credentials. Desktop must not send local simulation frames to a server-only endpoint.
- Calibration/connection with LeRobot and a real arm is unverified. Physical movement remains locked and is not part of this candidate.
- SmolVLA inference has not executed with real weights. ACT checkpoint joint order and action units remain unresolved, so predictions are inference-only.

### P2

- Windows NSIS and macOS DMG native builds/runtime checks are outstanding.
- Clean-machine Linux install, broader accessibility/small-window review, repeated-navigation recovery, and packaged app shutdown acceptance remain outstanding.
- OSMesa is absent on this build host. EGL model loading works; camera rendering on a target host still depends on its EGL/GPU drivers.
- Public release requires asset redistribution, signing, update and release approval gates in `docs/desktop/RELEASE_CHECKLIST.md`.

No AWS, Production, shared Supabase, installer publication or physical robot activity occurred. The Desktop is a simulation-ready candidate, not a public release or physical deployment approval.
