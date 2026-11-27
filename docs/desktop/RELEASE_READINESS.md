# VISTA Lab Station — Release Readiness

## Current PR #7 disposition — 2026-11-27

PR #7 is open on `codex/final-overnight-completion`, final source commit `e51a908e73a1c176396ad87b6696ca05af8406ed`; the final native CI run passed all Ubuntu, Windows and macOS jobs. Do not interpret CI packaging as final DEB acceptance: the combined Ubuntu artifact was too large to retrieve in this environment, so package metadata/hash/startup/SBOM/notices for this exact SHA are **not verified**. The earlier `0.1.1` DEB from `13fd11f` is stale and must not be used for commissioning. `v0.1.0` is untouched; no new public release was created.

**Prepared focused package path:** after the authorized PR merge, dispatch the existing `.github/workflows/desktop-release-draft.yml` with `source_sha=e51a908e73a1c176396ad87b6696ca05af8406ed` and `create_draft=false`. This workflow has only the Ubuntu amd64 DEB target and uploads the isolated `vista-desktop-ubuntu-x64` artifact with build provenance, checksums, binary/runtime SBOMs and third-party notices. Download that artifact from the single run, verify the DEB version/architecture/dependencies/launcher, source SHA and checksums, install/startup in an isolated Ubuntu environment, then retain the evidence privately. Do not set `create_draft=true` or publish it. This focused build has not been dispatched.

The final packaged Simulation child is bundled from this Desktop source's `edge/runtime.py`; the optional Robotics profile instead needs the operator's selected Python 3.12 environment and Edge source checkout. It does not use the separate SKYNET-Thesis/se R1 service. That service remains a distinct Cloud blocker; see [Final Acceptance Evidence](FINAL_ACCEPTANCE_EVIDENCE.md) and [AWS Acceptance Runbook](AWS_ACCEPTANCE_RUNBOOK.md). No final package is ready for today's physical commissioning.

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
