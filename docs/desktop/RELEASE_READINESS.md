# VISTA Lab Station — Release Readiness

## Current distribution disposition — 2026-11-27

PR #7 was merged by the repository owner as `4906fee4e455c37b8e044d3c7444f378b4a0021f`; final source `e51a908e73a1c176396ad87b6696ca05af8406ed` passed native run 45882596490. Documentation reconciliation is in open PR #8, head `1e3b2162876a7ba3ce461a52c496049fc1e9069f`, whose three native jobs passed run 45916146065.

**Focused package build succeeded:** existing `.github/workflows/desktop-release-draft.yml` ran Ubuntu-only workflow 45916626947 for source `e51a908e73a1c176396ad87b6696ca05af8406ed`, with `create_draft=false`. It generated isolated artifact `vista-desktop-ubuntu-x64`, ID `15162896520`, 133,172,802 bytes, archive digest `sha256:7a1fbfa716c01e6c0f53d4c51879eda16601865409afdac23ed9f4d208a276bf`. The artifact archive download stalled without transferring bytes. Only the archive digest is known; the inner DEB hash, metadata, launcher/startup, SBOM and license payload are not verified. The source package version is 0.1.1; do not treat the artifact as verified, publish it, or use it for commissioning until its contents are retrieved and inspected.

The final packaged Simulation child is bundled from this Desktop source's `edge/runtime.py`; the optional Robotics profile instead needs the operator's selected Python 3.12 environment and Edge source checkout. It does not use the separate SKYNET-Thesis/se R1 service. That service remains a distinct Cloud blocker; see [Final Acceptance Evidence](FINAL_ACCEPTANCE_EVIDENCE.md) and [AWS Acceptance Runbook](AWS_ACCEPTANCE_RUNBOOK.md). No locally verified package is ready for physical commissioning.

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
