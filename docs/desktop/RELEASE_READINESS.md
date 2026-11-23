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
| Windows NSIS | Latest native CI job failed; diagnosis is pending because GitHub API DNS was unavailable during assessment. |
| macOS ARM64 DMG | Native CI build passed; clean-machine runtime acceptance remains outstanding. |

## Release gates still open

- Verify evidence upload/retrieval and instructor review with isolated object storage.
- Provision and verify authenticated live Twin and device enrollment/revocation flows where required.
- Complete supervised SO-101 hardware connection/calibration/safety acceptance before any physical deployment.
- Verify ACT action semantics before mapping predictions; execute SmolVLA before claiming it works.
- Diagnose and rerun the failed Windows NSIS build; complete clean-machine runtime acceptance on Windows and macOS.
- Resolve model asset redistribution, signing, updates, privacy/logging and release approval.

Installers are local build outputs and were not published. No AWS/Production access, physical robot motion, or automatic merge was performed.
