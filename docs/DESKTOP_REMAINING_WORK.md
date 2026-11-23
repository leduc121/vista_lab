# VISTA Lab Station — Remaining Work

Assessment date: 2026-11-23. Current verification and feature status are in [Desktop Completion Acceptance](DESKTOP_FULL_ACCEPTANCE.md).

## AI policy validation

The pinned `BoyuZhao/so101-act-pick-and-place@c50534403a6635052f2abeeef5a9e74fe703fc51` checkpoint completed one real CPU `select_action()` call in isolated Python 3.12 / LeRobot 0.6.1 / Torch CPU. That establishes inference execution only. The schema-shaped synthetic input and six finite postprocessed outputs do not establish useful behavior, joint order, units, gripper semantics or action normalization. Keep model actions disconnected from MuJoCo, Twin and physical control until those details are authoritatively verified. SmolVLA real inference and preprocessing are unverified. See [ACT acceptance](desktop/HF_ACT_ACCEPTANCE_2026-11-22.md).

## Remaining work by priority

| Priority | Work | Current evidence / next step |
| --- | --- | --- |
| P1 / external | Evidence capture/upload for local trajectories and stored artifact retrieval | The Desktop has authenticated learner artifact list/download; backend evidence is produced from server runtime telemetry, digest-verified, and exposed to learner/teacher routes. There is no authorized local Desktop trajectory capture/upload route. Current isolated rerun could not start because port 54323 belongs to an active local JWKS server. Add a backend-owned simulation evidence producer and isolated object-storage fixture before end-to-end acceptance. |
| P1 / external | Authenticated live Twin WebSocket and local simulation telemetry | The local MuJoCo workspace visualizes measured frames over Electron IPC, and the Twin viewer validates provenance, six named joints, units, and freshness. Remote Twin publishing uses a server-signed route; no student-authorized local MuJoCo ingest contract exists. Keep those paths separate until the backend defines one. |
| P1 / hardware | Physical connection, calibration, telemetry and safety acceptance | No SO-101 was attached. Requires supervised hardware session and explicit authorization. Physical output remains disabled. |
| P1 / model metadata | ACT action units/order and SmolVLA execution | ACT inference ran only. Resolve authoritative checkpoint semantics before mapping predictions; execute SmolVLA with pinned weights/schema before claiming inference works. |
| P2 / acceptance | Windows NSIS runtime | Native CI run [45169792218](https://github.com/leduc121/vista_lab/actions/runs/45169792218) passed Windows NSIS packaging. Clean-machine install/startup/runtime acceptance remains open. |
| P2 | macOS DMG / clean-machine runtime acceptance | macOS ARM64 DMG build passed in CI. Native runtime and clean-machine install/startup are still unverified. |
| P2 | Clean install and broader UX/lifecycle review | Linux package build, Xvfb launch and bundled simulation smoke passed. Clean-machine install, responsive/accessibility coverage, repeated navigation and packaged shutdown remain open. |
| P2 | Release readiness | Confirm asset redistribution terms, signing/update approach, diagnostics/privacy review, and explicit release approval before publishing. |

## Completed checks in this assessment

- Node tests: 39/39; Python Edge tests: 51 passed, one Windows-only test skipped.
- Renderer and Electron Demo smokes passed.
- Prior isolated disposable Education API / GoTrue / PostgreSQL journey passed, including schematic events/results and independent database readback. The current rerun stopped safely before startup because port 54323 is owned by an active test server.
- Linux AppImage and DEB rebuilt; packaged Electron launch under Xvfb and bundled MuJoCo model load under EGL passed.
- Native CI passed Windows NSIS, Linux AppImage/DEB, and macOS ARM64 DMG packaging on commit `b2cd5f3`.
- The Linux PyInstaller build now explicitly includes `OpenGL.platform.egl`, discovered missing during packaged runtime acceptance.

The isolated runner requires Docker Compose, cached pinned images, at least 3 GiB available memory and the read-only backend checkout. It creates uniquely labeled disposable services and writes private diagnostic evidence under `/tmp`.
