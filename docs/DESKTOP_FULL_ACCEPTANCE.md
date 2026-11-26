# VISTA Lab Station — Desktop Completion Acceptance

**Assessment:** 2026-11-25 (updated with student-lab acceptance)
**Scope:** Desktop repository only. No Web repository files were modified.
**Decision:** **Simulation UI and bundled runtime PASS on the exact Ubuntu DEB candidate in Demo/test-fixture scope. Full student-lab acceptance remains PARTIAL because local simulation recording/evidence is not implemented and real student API persistence was not exercised. Physical robot deployment remains NO-GO.**

The focused first-run journey and current capability classifications are in
[Student Lab Product Acceptance](desktop/STUDENT_LAB_ACCEPTANCE_2026-11-25.md).
The final robotics contract results, packaged gripper-limit fix and remaining
evidence gaps are in
[Final Robotics Lab Acceptance](desktop/ROBOTICS_LAB_FINAL_ACCEPTANCE_2026-11-25.md).
The existing DEB candidate was verified by its owner-provided checksum and
launched from an extracted payload without rebuilding; its bundled MuJoCo
runtime completed Blockly exercises and returned simulation telemetry with
physical output disabled. The later strict five-step check found a simulated
gripper limit overrun in that original package. A five-step run also exposed a small gripper telemetry
limit overshoot. A local rebuilt candidate at `dist/phase6-candidate/` fixes
the simulated gripper target margin and passes the five-step packaged runtime
check. The supplied owner DEB remains untouched and retains the old defect;
the rebuilt candidate was not published.

## Acceptance matrix

| Area | Implementation and current evidence | Status / boundary |
| --- | --- | --- |
| Electron shell and navigation | Native Electron Demo workflow passed: login, Labs, attempt/workspace, save/version, schematic result, physical lock. Packaged Linux app opened under Xvfb. | **PASS** for local Demo workflow; real-backend Electron UI journey and broad accessibility review remain open. |
| Education Platform | Disposable GoTrue, Education API and PostgreSQL journey passed login/refresh, learning, assignment, attempt, Blockly save/version, schematic run/events/result, submission, projection, foreign-user denial, and independent DB readback. | **PASS** for the exercised local contracts. Temporary-password case skipped; file evidence/object storage and instructor review were not provisioned. |
| Robot connection and calibration | Role-specific discovery/configuration, guided calibration/profile workflow, errors, and safety gates are implemented and fake-device tested. | **PASS** for mock paths. No serial device or physical calibration was run; packaged LeRobot is unavailable. Windows MQTT mTLS remains locked until NTFS DACL validation is implemented. |
| Leader/follower teleoperation | Two isolated pairs, arm/deadman, watchdog, stop/reset, loss handling, bounded commands, and fake feedback passed Python, Node and Chromium acceptance. | **PASS** for fake runtime only. No physical command API is exposed. |
| MuJoCo SO-101 simulation | Six-joint scene, allowlisted execution, measured frames, authorization/confirmation, pause/cancel and policy simulation tests passed. Linux bundled runtime loaded the packaged scene under EGL and reported simulation available. | **PASS** for Linux simulation runtime. No simulator data is represented as physical measurement. |
| Digital Twin | Edge simulation emits measured six-joint frames; the local workspace Twin renders MuJoCo frames over Electron IPC. Viewer frame parsing validates robot provenance, named joints, units and freshness. Disconnect/stale frames now freeze the last pose instead of animating home. | **PARTIAL**. The authenticated remote WebSocket requires attempt scope and server-published telemetry. The backend's simulation publisher is server-signed; no student-authorized Desktop ingest contract exists. Connecting MuJoCo to the remote Twin would cross that boundary. |
| Trajectory library and evidence | Learner artifact listing and signed download use the authenticated Education API routes. Backend evidence storage persists runtime telemetry and verifies object digest/size before exposing an artifact; missing objects are returned unavailable. | **PARTIAL / BLOCKED**. The API has no student capture/upload route for local Desktop trajectories. Evidence is produced by the backend runtime, and instructor retrieval is an authenticated teacher route. Object storage and an authorized simulation evidence producer were not available for end-to-end acceptance. |
| ACT / SmolVLA | ACT adapter executed real CPU `select_action()` for the pinned checkpoint, as recorded in [ACT acceptance](desktop/HF_ACT_ACCEPTANCE_2026-11-22.md). Inference is isolated from action mapping. | **ACT inference-only PASS**. Joint order and units are unresolved; no ACT output may drive MuJoCo/Twin/robot. SmolVLA real inference is unverified. |
| Linux packaging | `npm run dist` completed on Linux x64 using Python 3.11.16. AppImage and DEB emitted; packaged Electron opened under Xvfb; the packaged Edge executable loaded the packaged model under EGL and shut down by protocol. | **PASS** for build and local launch/runtime smoke. Not a clean-machine install. AppImage required extract-and-run because host lacks FUSE; that wrapper needed manual termination after its window check. OSMesa is unavailable, so the OSMesa backend is not packaged. |
| Windows / macOS packaging | Native matrix run [45169792218](https://github.com/leduc121/vista_lab/actions/runs/45169792218) passed Windows NSIS, Linux AppImage/DEB, and macOS ARM64 DMG. Windows completed Edge tests, `npm ci`, Node tests, runtime builds, and NSIS packaging. | **PASS for packaging**. Windows and macOS clean-machine startup/runtime acceptance remains open. |
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
| `npm ci` after esbuild source fix | **PASS** on Linux and Windows; installed platform-aware esbuild 0.21.5. The lock includes 23 platform packages and pins `@esbuild/win32-x64` 0.21.5. |
| Native CI matrix on PR #1 | **PASS** on commit `b2cd5f3`; Windows NSIS, Linux AppImage/DEB, and macOS ARM64 DMG all built successfully. |
| `npm run dist` after esbuild fix | **PASS**; rebuilt Linux AppImage and DEB. |
| Current isolated LMS rerun | **BLOCKED before startup**; required port 54323 is owned by an active `local-jwks-server.mjs`. The existing listener and services were left untouched. |
| `git diff --check` | **PASS** |

The first packaged runtime probe exposed a missing PyInstaller hidden import for `OpenGL.platform.egl`, which made the packaged simulation unavailable when Electron set `MUJOCO_GL=egl`. `scripts/build-edge-runtime.py` now includes that import. The rebuilt Linux package passed the EGL runtime check.

The first PR CI matrix exposed a test-only global EGL override that failed on headless Linux and non-EGL platforms. The override was removed; camera observation unit coverage now mocks the GL renderer boundary while checking camera configuration and output schema. The full 52-case Edge suite passes locally after this correction (51 passed, one Windows-only test skipped).

The follow-up matrix found that `npm ci` could not use the stale lockfile; it now includes the missing transitive entries without changing versions of existing locked packages. Windows Python mode bits do not represent NTFS DACLs, so the MQTT client now refuses connections on Windows until explicit DACL validation exists. The native CI matrix targets Apple Silicon macOS because the pinned MuJoCo version has no Mac Intel wheel and pip would attempt a source build. The Linux-only esbuild binary is now an optional dependency; cross-platform dry runs pass for macOS ARM64 and Windows x64.

The original Windows failure came from a vendored esbuild Linux ELF and a lockfile without `@esbuild/win32-x64`. The platform-aware esbuild 0.21.5 package and complete optional dependency lock fixed `npm ci`; the next run exposed a POSIX-only file URL in the trusted-frame test fixture. That test now creates its URL using the host path and URL APIs. Native matrix run [45169792218](https://github.com/leduc121/vista_lab/actions/runs/45169792218) passed all three packaging targets. The Windows MQTT mTLS path remains fail-closed until NTFS DACL validation is implemented.

## Remaining issues

### P1 / blocked by external contract or infrastructure

- Local evidence capture/upload for simulated trajectories has no authorized Education API route. End-to-end storage/retrieval/instructor review needs a backend-owned simulation evidence producer and disposable object storage. Current authenticated learner artifact list/download remains available; missing objects fail closed.
- Authenticated live Twin WebSocket acceptance needs test-owned attempt/robot credentials and server-published telemetry. Desktop must not send local simulation frames to the server-signed publisher route.
- Calibration/connection with LeRobot and a real arm is unverified. Physical movement remains locked and is not part of this candidate.
- SmolVLA weights are not present locally and were not downloaded; inference is unverified. ACT inference passed once on CPU, but checkpoint joint order and action units remain unresolved, so outputs are inference-only.

### P2

- Clean-machine runtime acceptance remains outstanding for Windows and macOS; all three native packaging targets now build in CI.
- Clean-machine Linux install, broader accessibility/small-window review, repeated-navigation recovery, and packaged app shutdown acceptance remain outstanding.
- OSMesa is absent on this build host. EGL model loading works; camera rendering on a target host still depends on its EGL/GPU drivers.
- Public release requires asset redistribution, signing, update and release approval gates in `docs/desktop/RELEASE_CHECKLIST.md`.

No AWS, Production, shared Supabase, installer publication or physical robot activity occurred. The Desktop is a simulation-ready candidate, not a public release or physical deployment approval.
