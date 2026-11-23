# VISTA Lab Station — Release Readiness

**Assessment date:** 2026-11-23
**Simulation-ready Desktop candidate:** **GO**
**Physical robot deployment:** **NO-GO**
**Public release approval:** **NO-GO**

See [Desktop Completion Acceptance](../DESKTOP_FULL_ACCEPTANCE.md) for the current feature matrix, test evidence, Linux build/runtime checks and open issues. It supersedes older assessments in this directory.

## Platform status

| Target | Current result |
| --- | --- |
| Linux x64 AppImage | Build passed. Electron window passed under Xvfb using extract-and-run because host FUSE device is unavailable. |
| Linux x64 DEB | Build passed. Packaged Electron launch and bundled Edge/MuJoCo scene smoke passed from the current Linux build. No clean-machine installation was performed. |
| Windows NSIS | Native CI run [45169792218](https://github.com/leduc121/vista_lab/actions/runs/45169792218) passed `npm ci`, tests, runtime builds, and NSIS packaging. Windows clean-machine startup/runtime acceptance remains outstanding. |
| macOS ARM64 DMG | Native CI build passed; clean-machine runtime acceptance remains outstanding. |

## Release gates still open

- Define and implement a backend-owned local-simulation evidence producer/upload contract; the Education API currently creates telemetry evidence from server runtime snapshots and supports authenticated learner listing/download and teacher review.
- Provision test-owned attempt/robot credentials and server-published telemetry for authenticated live Twin verification. Desktop does not publish local MuJoCo frames to the server-signed publisher endpoint.
- Complete supervised SO-101 hardware connection/calibration/safety acceptance before any physical deployment.
- Verify ACT action semantics before mapping predictions; execute SmolVLA before claiming it works.
- Complete clean-machine runtime acceptance on Windows and macOS.
- Resolve model asset redistribution, signing, updates, privacy/logging and release approval.

Installers are local build outputs and were not published. No AWS/Production access, physical robot motion, or automatic merge was performed.
