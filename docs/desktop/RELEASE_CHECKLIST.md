# VISTA Lab Station 0.1.0 release checklist

Status: **not ready for public release**. Desktop source SHA: `80aef01eca657fa8a2dbe3340bac27e048619b11`. No functionality, safety, or WF03 contracts changed.

## Resolved

- [x] Owner confirmed ownership of checkIk source and authorized integration, modification, packaging, and redistribution with VISTA Lab Station. No attribution is required for original code; no SPDX license is assigned.
- [x] Five reused checkIk files and SHA-256 provenance documented in `THIRD_PARTY_NOTICES.md` and `DESKTOP_DISTRIBUTION_SBOM.cdx.json`. The separate ignored checkout is not bundled.
- [x] Source-input CycloneDX SBOM and third-party notices prepared. Unknown licenses remain `NOASSERTION`; the source SBOM is not claimed to be complete for the packaged binaries.
- [x] Corrected candidate run `45570937327` completed successfully with source input `80aef01eca657fa8a2dbe3340bac27e048619b11`. Windows x64, Ubuntu x64 (DEB + AppImage), and macOS arm64 artifacts share this run; all embedded source/platform metadata matched, GitHub archive digests were recomputed and matched, and installer payload hashes were recomputed locally. This is a branch candidate, not the final main Draft.
- [x] Native build workflow forces `electron-builder --publish never`; the first dispatch's implicit publish failure was fixed, and the successful rerun uploaded artifacts.
- [x] PR #3 native CI passed for Ubuntu, Windows, and macOS arm64 at commit `7223fd50a5453cbd350fb8c84d63f8fbc116fc2e`. Later handoff-only commit records exact artifact hashes.

## Pending before public release

- [x] PR #3 and PR #4 merged; current main merge SHA is `e01cf9e0e14ba668797a9aa0755f6c4697a7fc00`.
- [x] Main Draft run `45581975447` passed Windows x64, Ubuntu x64, and macOS Apple Silicon ARM64 native builds from Desktop source SHA `80aef01eca657fa8a2dbe3340bac27e048619b11`. Draft assembly failed because the Windows artifact includes auxiliary `.exe` binaries and the workflow treated every `.exe` as an installer. No Draft Release was created.
- [ ] Merge targeted installer-selection fix PR #5, then rerun `Desktop release draft` from `main` with `source_sha=80aef01eca657fa8a2dbe3340bac27e048619b11` and `create_draft=true`. It builds Windows x64, Linux x64, and macOS ARM64 in one workflow run. macOS Intel is excluded from v0.1.0 because the pinned dependency lacks a compatible wheel. It creates only a Draft after all required jobs and provenance checks succeed.
- [ ] Confirm `SHA256SUMS` in the Draft, download the release assets and recompute each digest. Record final versioned URLs only after this fetch-back check.
- [ ] Run and inspect the successful Draft run's Syft platform-package SBOM, Python `Requires-Dist` dependency graph, and collected license-text archive. Review component coverage and preserve `NOASSERTION` where the evidence does not establish a license.
- [x] Candidate run `45570937327` DEB metadata, desktop file validation, icon, install, purge and packaged Simulation Profile were checked in isolated Ubuntu 24.04. AppImage opened under Xvfb. Default sandboxed GTK launch remains inconclusive under Docker’s disabled user namespaces; retest on a standard Ubuntu desktop before publication.
- [x] Linux DEB from main run `45581975447` installed and passed desktop-file validation, icon/package/runtime checks, isolated Simulation Profile (19 frames, `motionEnabled=false`), and purge. Its AppImage launched under Xvfb in the same isolated Ubuntu 24.04 container. The run failed assembly, so repeat acceptance on the final successful Draft assets. Default sandboxed `gtk-launch` remains unverified in Docker because user namespaces are disabled.
- [ ] Repeat Linux package acceptance against the exact assets in the successful `main` Draft. Robotics remains an optional external isolated Python 3.12 environment plus authorized Edge checkout; do not install into system Python or fetch models/CUDA.
- [ ] Confirm platform signing/notarization decision and minimum system requirements. macOS Intel is not part of v0.1.0. Verify Apple Silicon startup before publication.
- [ ] Owner reviews and explicitly approves publication. Never click **Publish release** without approval.

## Current artifact status

- Candidate artifacts from same-source run `45570937327` (Windows x64, Ubuntu x64 and macOS arm64) were downloaded, source/platform provenance checked, archive digests matched to GitHub API, and payload checksums recomputed. These are from the unmerged fix branch with `create_draft=false`; do not mix them with future run assets or use them as Draft Release files.
- macOS Intel x64 is not included in v0.1.0: the pinned `mujoco==3.17.0` dependency has no CPython 3.11 Intel macOS wheel, so pip attempts source compilation and requires an external MuJoCo SDK. Do not alter the runtime dependency solely to force this platform into the capstone release.
- No `v0.1.0` Draft/Release or public download URL exists. PR #5 is open to correct installer selection after the first `main` run failed at assembly. macOS Intel is explicitly not supported for this release.
