# VISTA Lab Station 0.1.0 release checklist

Status: **not ready for public release**. Desktop source SHA: `80aef01eca657fa8a2dbe3340bac27e048619b11`. No functionality, safety, or WF03 contracts changed.

## Resolved

- [x] Owner confirmed ownership of checkIk source and authorized integration, modification, packaging, and redistribution with VISTA Lab Station. No attribution is required for original code; no SPDX license is assigned.
- [x] Five reused checkIk files and SHA-256 provenance documented in `THIRD_PARTY_NOTICES.md` and `DESKTOP_DISTRIBUTION_SBOM.cdx.json`. The separate ignored checkout is not bundled.
- [x] Source-input CycloneDX SBOM and third-party notices prepared. Unknown licenses remain `NOASSERTION`; the source SBOM is not claimed to be complete for the packaged binaries.
- [x] Native Actions run `45564467771` completed successfully using source SHA `80aef01eca657fa8a2dbe3340bac27e048619b11`. Windows x64, Ubuntu x64 (DEB + AppImage), and macOS arm64 artifacts share this run and record the same source SHA. CI SHA256SUMS and artifact filenames are recorded in `../../DESKTOP_DISTRIBUTION_HANDOFF.md`.
- [x] Native build workflow forces `electron-builder --publish never`; the first dispatch's implicit publish failure was fixed, and the successful rerun uploaded artifacts.
- [x] PR #3 native CI passed for Ubuntu, Windows, and macOS arm64 at commit `7223fd50a5453cbd350fb8c84d63f8fbc116fc2e`. Later handoff-only commit records exact artifact hashes.

## Pending before public release

- [ ] Merge PR #3. The new four-platform draft workflow cannot be dispatched until it is on the default branch.
- [ ] Dispatch `Desktop release draft` with `source_sha=80aef01eca657fa8a2dbe3340bac27e048619b11` and `create_draft=true`. It builds Windows x64, Linux x64, and macOS arm64 in one workflow run; macOS Intel is excluded because pinned MuJoCo has no CPython 3.11 Intel macOS wheel. It creates only a Draft after all required jobs and provenance checks succeed.
- [ ] Confirm `SHA256SUMS` in the Draft, download the release assets and recompute each digest. Record final versioned URLs only after this fetch-back check.
- [ ] Reconcile per-runner Python environment BOM and source-input SBOM with actual frozen runtime and packaged Electron contents. Add any native/transitive dependency notices; retain `NOASSERTION` where licensing cannot be established.
- [ ] On Ubuntu, inspect the exact DEB metadata, desktop entry and icon; install, launch via desktop launcher/`gtk-launch`, and uninstall. Launch the exact AppImage. Capture evidence.
- [ ] Open the installed exact-SHA app and confirm Simulation Profile. Robotics remains an optional external isolated Python 3.12 environment plus authorized Edge checkout; do not install into system Python or fetch models/CUDA.
- [ ] Confirm platform signing/notarization decision and minimum system requirements. Verify macOS Intel and Apple Silicon runtime startup.
- [ ] Owner reviews and explicitly approves publication. Never click **Publish release** without approval.

## Current artifact status

- Available from Actions run `45564467771`: Windows x64 NSIS, Ubuntu x64 DEB, Ubuntu x64 AppImage, and macOS arm64 DMG. SHA256 values and filenames are listed in `DESKTOP_DISTRIBUTION_HANDOFF.md`. Build-generated hashes are recorded; full installer bytes have not all been downloaded/recomputed locally.
- macOS Intel x64 is not included in v0.1.0: the pinned `mujoco==3.17.0` dependency has no CPython 3.11 Intel macOS wheel, so pip attempts source compilation and requires an external MuJoCo SDK. Do not alter the runtime dependency solely to force this platform into the capstone release.
- No `v0.1.0` tag, GitHub Release, or public download URL exists.
