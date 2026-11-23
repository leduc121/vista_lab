# VISTA Lab Station — Remaining Work

Assessment date: 2026-11-23. Current verification and feature status are in [Desktop Completion Acceptance](DESKTOP_FULL_ACCEPTANCE.md).

## AI policy validation

The pinned `BoyuZhao/so101-act-pick-and-place@c50534403a6635052f2abeeef5a9e74fe703fc51` checkpoint completed one real CPU `select_action()` call in isolated Python 3.12 / LeRobot 0.6.1 / Torch CPU. That establishes inference execution only. The schema-shaped synthetic input and six finite postprocessed outputs do not establish useful behavior, joint order, units, gripper semantics or action normalization. Keep model actions disconnected from MuJoCo, Twin and physical control until those details are authoritatively verified. SmolVLA real inference and preprocessing are unverified. See [ACT acceptance](desktop/HF_ACT_ACCEPTANCE_2026-11-22.md).

## Remaining work by priority

| Priority | Work | Current evidence / next step |
| --- | --- | --- |
| P1 / external | Evidence file upload/retrieval, storage metadata and instructor review | Core submission and Education API persistence passed in disposable local E2E. Provision isolated object storage and test-owned evidence before claiming this path. |
| P1 / external | Authenticated live Twin WebSocket and local simulation telemetry | The isolated run skipped Twin credentials. No student-authorized local MuJoCo telemetry ingestion contract was verified. Keep local frames local; request backend-owned contract if live synchronization is required. |
| P1 / hardware | Physical connection, calibration, telemetry and safety acceptance | No SO-101 was attached. Requires supervised hardware session and explicit authorization. Physical output remains disabled. |
| P1 / model metadata | ACT action units/order and SmolVLA execution | ACT inference ran only. Resolve authoritative checkpoint semantics before mapping predictions; execute SmolVLA with pinned weights/schema before claiming inference works. |
| P2 | Windows NSIS / macOS DMG native build and runtime acceptance | Build and test on native runners; Linux success does not prove cross-platform success. |
| P2 | Clean install and broader UX/lifecycle review | Linux package build, Xvfb launch and bundled simulation smoke passed. Clean-machine install, responsive/accessibility coverage, repeated navigation and packaged shutdown remain open. |
| P2 | Release readiness | Confirm asset redistribution terms, signing/update approach, diagnostics/privacy review, and explicit release approval before publishing. |

## Completed checks in this assessment

- Node tests: 39/39; Python Edge tests: 51/51.
- Renderer and Electron Demo smokes passed.
- Isolated disposable Education API / GoTrue / PostgreSQL journey passed, including schematic events/results and independent database readback. Temporary-password and Twin suites were skipped because no test-owned accounts/endpoints were provisioned.
- Linux AppImage and DEB builds completed; packaged Electron launch and bundled MuJoCo model load under EGL passed.
- The Linux PyInstaller build now explicitly includes `OpenGL.platform.egl`, discovered missing during packaged runtime acceptance.

The isolated runner requires Docker Compose, cached pinned images, at least 3 GiB available memory and the read-only backend checkout. It creates uniquely labeled disposable services and writes private diagnostic evidence under `/tmp`.
