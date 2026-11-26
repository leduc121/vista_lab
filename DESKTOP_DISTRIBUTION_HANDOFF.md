# VISTA Lab Station 0.1.0 — Ubuntu Distribution Handoff

## Current overnight release checkpoint — 2026-11-27

The owner reports that Ubuntu amd64 `0.1.0` has already been publicly released. This pass did not replace or republish it. A private `0.1.1` candidate exists at `dist/ubuntu-0.1.1-checkpoint/`: 148,156,302 bytes, SHA-256 `402aeca230f4362f0f1e2f2336b606c340cee776478a94595fdf1f4c8a2a7e42`, package `vista-lab-station`, architecture `amd64`, with the dependencies listed below. Its source is `13fd11fa031168ed1d237784293c00b35d5794ca`; provenance records a local build (`workflow_run_id=unavailable-local-build`), so it does **not** prove the final follow-up PR source. The archive, SBOM, third-party notices and their hashes were verified for that candidate. No `0.1.1` public release was created.

The final PR's Ubuntu Actions artifact must be checked against its exact source SHA before it can become the next release candidate. Verify DEB metadata, runtime dependencies, launcher, startup, SHA-256, provenance and third-party notices from that artifact. Do not invoke the legacy `desktop-release-draft.yml`: it is pinned to `0.1.0`. Keep Windows/macOS outside this release scope. See [Final Acceptance Evidence](docs/desktop/FINAL_ACCEPTANCE_EVIDENCE.md) and [AWS Acceptance Runbook](docs/desktop/AWS_ACCEPTANCE_RUNBOOK.md) for the current integrated acceptance boundaries.

The completed branch is pushed as `codex/final-overnight-completion`, final implementation commit `6bc4bc77fe08141b7f5f22df900c7092d78ffc0d`. The workspace cannot create a PR or inspect Actions because its GitHub CLI token is invalid and no authenticated browser session is available. The exact compare/create URL is [main…final-overnight-completion](https://github.com/leduc121/vista_lab/compare/main...codex/final-overnight-completion?expand=1). Once the owner opens that PR, the existing native acceptance workflow will run from the PR head; download and verify only its Ubuntu artifact before replacing this package checkpoint.

Reproducible Ubuntu build command for the final PR head (not run locally because the established pipeline assigns native packaging to GitHub Actions):

```bash
VISTA_EDGE_PYTHON=edge/.venv/bin/python npm run build:edge-runtime
npx electron-builder --linux deb --x64 --publish never
npm run release:checksums
```

The CI provenance must identify the exact PR head SHA, Actions run URL, Ubuntu runner, architecture `amd64`, `0.1.1` package metadata, artifact checksums, SBOM and license archive. Do not publish the result as a Release in this checkpoint.

The released `0.1.0` asset's bytes and published checksum are **not independently re-fetched in this workspace**. Keep the prior “owner-reported” qualification below; do not use historical workspace candidate hashes as the published checksum.

**Release state:** The owner reports Ubuntu amd64 v0.1.0 completed its approved release process. This workspace cannot independently fetch the current Release or asset, so its published checksum, size, tag target, and owner-tested revision are **not verified here**. Canonical owner-designated URLs are the [v0.1.0 Release](https://github.com/leduc121/vista_lab/releases/tag/v0.1.0) and [Ubuntu DEB](https://github.com/leduc121/vista_lab/releases/download/v0.1.0/VISTA.Lab.Station-0.1.0-amd64.deb). Do not use a historical workspace candidate hash as the published checksum.

**Acceptance reports (2026-11-25):** [Final Robotics Lab Acceptance](docs/desktop/ROBOTICS_LAB_FINAL_ACCEPTANCE_2026-11-25.md) records the corrected local candidate; [Final Education Platform Integration Handoff](docs/desktop/FINAL_EDUCATION_PLATFORM_INTEGRATION_HANDOFF_2026-11-25.md) records Web/AWS boundaries; [Final Installation and Student UX Acceptance](docs/desktop/FINAL_INSTALLATION_STUDENT_UX_ACCEPTANCE_2026-11-25.md) records package/install limits and student workflow.

**Final handoff status:** Owner approval/publication is recorded per the owner's latest message. Prior Desktop acceptance limits remain in force: physical robot acceptance and AWS E2E are not completed; Desktop MuJoCo recording is not associated with a Web submission in the local evidence. The current Release's checksum and asset manifest must be fetched by the Web/release owner before Homepage metadata is finalized. Detailed Desktop capabilities and the Claude handoff are in [Final Acceptance Evidence](docs/desktop/FINAL_ACCEPTANCE_EVIDENCE.md).

## Release artifact

| Field | Verified value |
| --- | --- |
| Version | `0.1.0` |
| Platform / architecture | Ubuntu/Debian Linux `amd64` (x86_64) |
| Published DEB filename | `VISTA.Lab.Station-0.1.0-amd64.deb` (owner-designated) |
| Published size / SHA-256 | **Not independently verified in this workspace** |
| Public Release / DEB URL | Owner-designated URLs above; anonymous fetch was unavailable from this environment |
| Source revision / tag target | **Not independently verified**; prior source candidate SHA `80aef01eca657fa8a2dbe3340bac27e048619b11` applies to an older recorded asset only |
| Historical local candidates | Old Draft copy: 131,395,882 bytes / `a5dbca4d…3ba8e4`; corrected local candidate: 296,291,230 bytes / `8eb5d74c…a29309b4`; staged RC DEB: 106,264,490 bytes / `548cced6…07b4fef8`. None is asserted as the currently published asset. |

The Ubuntu-only v0.1.0 public scope is per the owner's release instruction. The repository also contains historical Windows/AppImage staging artifacts; they are not part of this release and must not be linked as downloads. Windows and macOS should be shown as Coming Soon.

## Ubuntu installation

See [USER_GUIDE_EN.md](docs/desktop/USER_GUIDE_EN.md) for the owner-designated download, checksum comparison, install, launch, and uninstall commands. The literal final checksum must be copied from the current published `SHA256SUMS` only after verifying the release asset.

The package declares `libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0`; APT resolves these dependencies.

## Acceptance status

The records below are historical evidence for earlier candidates and CI runs. They are retained for provenance; do not apply their hash, test scope, or Draft status to the owner's current published asset without a fresh release-manifest match.

- CI: native build job succeeded for Ubuntu x64 DEB only. The main workflow's `draft-release` job failed because it expected `release-assets/platforms/ubuntu-x64/`, while `download-artifact` created `release-assets/platforms/vista-desktop-ubuntu-x64/`. Historical Draft assembly and PR #6 are not fresh proof of current tag/asset provenance.
- Provenance: artifact markers for a prior candidate matched Desktop source SHA `80aef01eca657fa8a2dbe3340bac27e048619b11`; that source revision is not confirmed for the current release. Previous downloaded Draft assets passed their then-current `SHA256SUMS` checks; the current public Release could not be fetched here.
- Package: the corrected candidate metadata is package `vista-lab-station`, version `0.1.0`, architecture `amd64`, with GTK/NSS/X11/secret-service dependencies and optional AppIndicator. It contains an Education desktop entry and one 512×512 hicolor icon. Clean installation and menu registration were not tested.
- Simulation Profile: the corrected local candidate passed extracted-payload Electron/MuJoCo acceptance in the robotics report. The older Draft DEB is a different artifact and retains the measured gripper-limit defect.
- Launcher and uninstall: the extracted executable, desktop entry, icon and package removal scripts were inspected. System menu registration, apt install, apt purge, and reinstall were not run.
- SBOM/notices: existing local records include a 47-component binary SBOM and 18-component/19-relationship Python runtime inventory for an earlier artifact. They are not asserted to describe the current published DEB until exact-hash matching is recorded. Preserve `NOASSERTION`; no first-party license is inferred. The current public asset's binary/runtime inventory and notice archive were not available to inspect here.

## System requirements

- amd64 Ubuntu is the target. Evidence is limited to an Ubuntu 26.04.1 build runner and Ubuntu 26.04.1 workspace host; no other Ubuntu release is claimed as tested.
- Internet access for the initial download and any APT dependencies not already installed.
- No GPU or CUDA is required for Simulation Profile. The release does not install a model or modify system Python.

## Robotics Profile setup

Robotics Profile requires an operator-managed Python 3.12.14 virtual environment and an authorized VISTA Edge source checkout containing `edge/runtime.py`. It is not bundled in the DEB.

```sh
uv python install 3.12.14
uv sync --locked --project edge/robot-runtime --python 3.12.14
uv pip check --python edge/robot-runtime/.venv/bin/python
```

Select `edge/robot-runtime/.venv/bin/python` and the Edge checkout root in Desktop Settings. No model, CUDA, or system-Python dependency is installed by Desktop. Physical robot operation is not certified by this release.

## Known limitations

- Ubuntu amd64 DEB only for this release; Windows and macOS are Coming Soon. Historical Windows/AppImage outputs in local staging are not release assets.
- Owner reports the Release is published. This workspace could not verify anonymous access, exact size/hash, or the latest release checksum manifest.
- Prior local evidence did not include a clean install/menu/purge cycle for the corrected candidate. The owner's final external Ubuntu acceptance is reported complete, but its OS version and exact tested binary hash are not present in this checkout.
- Prior third-party evidence remains scoped to its recorded DEB hash. Preserve SBOM `NOASSERTION`; attach the current release's license archive and reconciliation only after they are hash-matched to the published DEB.
- Robotics requires an external Edge checkout and Python environment. Physical robot operation is not certified.
