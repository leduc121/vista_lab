# VISTA Desktop 0.1.0 distribution handoff

**Status: automation prepared on `codex/desktop-distribution-handoff`; no public downloads.** Updated 2026-11-25 for Claude Code. Desktop package source remains merge `80aef01eca657fa8a2dbe3340bac27e048619b11`. This branch adds release automation and documents only; no app functionality, safety, or WF03 behavior was changed. No public release was created and Web SKYNET-Thesis/se was not changed.

## Release summary and platform matrix

| Platform / architecture | Requested artifact | Candidate filename | SHA-256 (CI build manifest from run `45564467771`) | Download status |
| --- | --- | --- | --- | --- |
| Windows x64 | NSIS `.exe` | `VISTA Lab Station-0.1.0-x64-setup.exe` | `47f1f1cdb6df911f8b11159990d1c15c0526b70666e8914a2300c4bae3b7b5fb` | Actions artifact from run `45564467771`; public Release URL pending. |
| Ubuntu/Debian amd64 | `.deb` | `VISTA Lab Station-0.1.0-amd64.deb` | `17cc236d082620da05ea8d3148a5a029387b4e35e6d0844010afad1c1b067d15` | Actions artifact from run `45564467771`; public Release URL pending. |
| Linux x86_64 | AppImage | `VISTA Lab Station-0.1.0-x86_64.AppImage` | `3987709605965b50ff56de01bf2719c603da26d32cc4959c09dc1cf536fd6960` | Actions artifact from run `45564467771`; public Release URL pending. |
| macOS Intel x64 | `.dmg` | Expected from builder: `VISTA Lab Station-0.1.0-x64.dmg` | **Pending** | New draft workflow uses GitHub runner `macos-15-intel`; no artifact is verified yet. |
| macOS Apple Silicon arm64 | `.dmg` | `VISTA Lab Station-0.1.0-arm64.dmg` | `dd100c8123159aa34fcef66168184c248e4dae6a6fe52f6f0e37f5d129216ef6` | Actions artifact from run `45564467771`; public Release URL pending. |

The SHA values above were read from each artifact's `SHA256SUMS`; embedded provenance records source SHA `80aef01eca657fa8a2dbe3340bac27e048619b11` and workflow run `45564467771`. They are CI-generated installer hashes, not yet recomputed from full local installer downloads. The tracked `releases/v0.1.0/` contains older filenames and hashes; its manifest is not evidence for the merge SHA. `scripts/validate-download-release.cjs` only verifies internal consistency of that old local stage. Those files do not match the current builder's expected output names, and their Linux hashes differ from files in ignored `dist/`. Do not publish or combine any of these files with CI outputs. Generate final SHA values and `SHA256SUMS` only from the exact verified CI artifacts downloaded from one Actions run at the merge SHA.

### Versioned download URL plan

There are **no verified download URLs**. Do not put download links on the website. GitHub API read access now works, but no exact-SHA run or Release assets exist. After a Draft is reviewed, approved, published, and downloaded back with matching hashes, GitHub's versioned URL pattern will be:

```text
https://github.com/leduc121/vista_lab/releases/download/v0.1.0/<exact-filename>
```

Do not use this pattern as a live link until the asset is uploaded and fetched back from GitHub with matching SHA-256. Do not create a `latest` alias for this capstone handoff.

## CI and release integrity

- **Package source SHA:** `80aef01eca657fa8a2dbe3340bac27e048619b11`. GitHub API query returned no Actions run for that SHA. The release/tag APIs returned 404 for `v0.1.0`; there is no published release or tag to reuse.
- The existing `.github/workflows/native-build.yml` supports Windows x64 NSIS, Linux x64 DEB + AppImage, and macOS arm64 DMG. It now accepts an explicit source SHA, records it into each artifact, and forces `--publish never`; it does not include Intel macOS or Release creation.
- New `.github/workflows/desktop-release-draft.yml` runs all four native platform jobs from one required source SHA, adds macOS Intel using `macos-15-intel`, tags each artifact with its source SHA/platform, gathers artifacts from the same workflow run, generates `SHA256SUMS`, and creates only a **Draft** when manually dispatched with `create_draft=true`. It never publishes. Draft creation fails if a platform artifact is missing, provenance differs, or a `v0.1.0` release/tag conflicts with the requested source commit.
- Each native job attaches a CycloneDX inventory of its pip build environment. The release also attaches the source-input SBOM and notices. These are transparent inventories, not yet proof of the exact binary dependency closure or clean-machine acceptance; do not publish until that reconciliation and acceptance evidence are recorded.
- The branch workflow itself must be merged into `main` before GitHub will offer the new workflow for dispatch. Then dispatch **Desktop release draft** with `source_sha=80aef01eca657fa8a2dbe3340bac27e048619b11`, `create_draft=true`. A failed runner blocks the collector and draft creation.

### Draft release procedure

After the branch PR is merged: repository `leduc121/vista_lab` → **Actions** → **Desktop release draft** → **Run workflow**. Enter the exact `source_sha` above and keep `create_draft` enabled. Wait for all four platform jobs and the `draft-release` job to succeed. Verify Draft assets against `SHA256SUMS`, fetch them back for another digest check, and complete artifact-level notices and target-machine acceptance before asking the owner to publish. Do not use files from `dist/` or `releases/v0.1.0/`.

## Source and dependency distribution rights

- `models/so101` carries the upstream MuJoCo Menagerie / Robot Studio model README and Apache-2.0 license. `renderer/assets/so101` carries its LICENSE and NOTICE. See [asset provenance](docs/desktop/ASSET_PROVENANCE.md).
- **checkIk owner permission is confirmed.** The owner confirmed that they own the checkIk source and authorize integration, modification, packaging, and redistribution as part of VISTA Lab Station, with no additional attribution or notice required for their original code. No named SPDX license is assigned. Five files are reused under `edge/checkik_kinematics/`: `__init__.py`, `ik.py`, `kinematics.py`, `safety.py`, and `so101_new_calib.urdf`; the exact provenance and SHA-256 values are recorded in [third-party notices](docs/desktop/THIRD_PARTY_NOTICES.md) and the CycloneDX SBOM. Runtime imports these files and packages them through the frozen Edge runtime. The rest of the separate ignored checkIk checkout is not included.
- `package-lock.json` and the direct Python dependency inventory are represented in the prepared source-input SBOM/notices. Electron/Chromium and MuJoCo license texts are documented. The Python runtime resolves transitive versions per native CI job, so dependency redistribution is **not yet fully verified against final installer contents**; reconcile exact artifact contents before publication.
- Windows/macOS artifacts are unsigned according to the current candidate manifest; signing/notarization policy and its effect on final hashes are unresolved.

## Linux installation and website command snippets

CI-generated SHA256 values are recorded above for exact-SHA artifacts. No public download URL exists yet. These commands become copy-paste ready only after the Draft is approved/published and the assets are fetched back with matching SHA256. Substitute only exact filenames and hashes shown in that verified Release; do not copy placeholders to the homepage.

### Ubuntu/Debian `.deb`

```sh
set -eu
file='VISTA Lab Station-0.1.0-amd64.deb' # replace with verified filename from exact-SHA CI run
url='<PENDING: exact URL appears only after the v0.1.0 Draft is approved and published>' # not a live URL
expected='<SHA256 from that release SHA256SUMS>'
curl --fail --location --proto '=https' --proto-redir '=https' -o "$file" "$url"
printf '%s  %s\n' "$expected" "$file" | sha256sum -c -
sudo apt install "./$file"
gtk-launch vista-lab-station
```

Uninstall with `sudo apt remove vista-lab-station`. The old staged DEB declares GTK 3, libnotify, NSS, XSS, XTST, xdg-utils, AT-SPI, libuuid and libsecret. It contains `/usr/share/applications/vista-lab-station.desktop` with `Icon=vista-lab-station` and a 512×512 hicolor icon. This confirms only old candidate metadata, not that the exact-SHA CI package matches or opens from the launcher. Verify the downloaded CI DEB's desktop entry/icon before using this command for acceptance.

### Linux AppImage

```sh
set -eu
file='VISTA Lab Station-0.1.0-x86_64.AppImage' # replace with verified filename from exact-SHA CI run
url='<PENDING: exact URL appears only after the v0.1.0 Draft is approved and published>'
expected='<SHA256 from that release SHA256SUMS>'
curl --fail --location --proto '=https' --proto-redir '=https' -o "$file" "$url"
printf '%s  %s\n' "$expected" "$file" | sha256sum -c -
chmod +x "$file"
"$PWD/$file"
```

The tracked `releases/v0.1.0/install-linux.sh` also pins the candidate Linux hashes and supports `--appimage` and `--deb`. Its remote installation mode requires the approved HTTPS downloads root; it refuses plain HTTP and checks the SHA-256 before install. AppImage installs into the current user's data directory and does not need sudo. Remove its installed file at `${XDG_DATA_HOME:-$HOME/.local/share}/vista-lab-station/v0.1.0/VISTA-Lab-Station-0.1.0-x86_64.AppImage`. The script does not create a launcher entry for AppImage; run the file directly. Do not imply launcher integration is tested.

**Linux acceptance status:** old candidate DEB desktop file/icon paths were inspected. Existing docs record AppImage/extracted-DEB launch smoke on a development host, not a clean system install. For exact-SHA CI package acceptance, install the DEB then launch it via the app launcher or `gtk-launch vista-lab-station`; uninstall using `sudo apt remove vista-lab-station`. For AppImage, launch `./<verified-AppImage>` and uninstall by deleting that downloaded file. Launcher opening, icon rendering and uninstall are not yet verified; do not claim a pass.

The DEB install should register `/usr/share/applications/vista-lab-station.desktop` with `Icon=vista-lab-station`. Verify the exact package before installing:

```sh
dpkg-deb --field "$file" Package Version Architecture Depends
dpkg-deb --contents "$file" | grep -E 'usr/share/applications/.*desktop|usr/share/icons/.*vista-lab-station'
```

After installation, verify the launcher entry, icon and start command; after testing run `sudo apt purge vista-lab-station` and confirm it is removed. For AppImage, launch the downloaded file directly and uninstall by deleting it. These checks are pending on the exact build.

## Runtime profiles and system requirements

- **Simulation:** the CI workflow runs `npm run build:edge-runtime` before Electron Builder; package config adds `edge/dist/vista-edge-runtime` and `models/so101` as extra resources. Linux packaged MuJoCo simulation has local smoke evidence in [full acceptance](docs/DESKTOP_FULL_ACCEPTANCE.md). The target downloadable CI bytes are inaccessible here, so inspect the exact-SHA package for the Edge executable and model, install it, open Settings, confirm Simulation is ready, and complete a local MuJoCo lab before claiming this profile works in the release.
- **Robotics:** not self-contained. Settings requires an operator-selected isolated Python 3.12 environment and a VISTA Edge source checkout containing `edge/runtime.py`. The separate `checkIk` checkout is not required; five owner-authorized checkIk-derived files are bundled in the Desktop Edge runtime. `fakeRobot=true` and `hardwareEnabled=false` are enforced by the runtime defaults; real hardware use is outside this release acceptance.
- The published lock profile is `edge/robot-runtime/pyproject.toml` + `uv.lock`: Python 3.12.14, LeRobot 0.6.1 with Feetech, PyTorch 2.7.1 CPU, TorchVision 0.22.1 CPU, NumPy 2.2.6, MuJoCo 3.17.0, Paho MQTT 2.2.0, PySerial 3.5, PyInstaller 6.19.0 and CMake 3.31.6. It includes no CUDA/NVIDIA packages or model checkpoints. A verified isolated setup is documented in [robotics compatibility](docs/desktop/ROBOTICS_RUNTIME_COMPATIBILITY.md); environment footprint was about 1.2 GiB. This setup is optional and is not installed by the Desktop installer.

Ubuntu demo-host setup (uses `uv`, never modifies system Python):

```sh
uv python install 3.12.14
uv sync --locked --project edge/robot-runtime --python 3.12.14
uv pip check --python edge/robot-runtime/.venv/bin/python
```

Then in Desktop Settings select `edge/robot-runtime/.venv/bin/python` and the authorized source checkout root containing `edge/runtime.py`. On Windows/macOS, use the platform's interpreter path from the equivalent isolated environment. No model, CUDA, or dependency installation into system Python is part of this handoff.

**Minimum OS versions / hardware requirements:** not established by the current release evidence. Linux package dependencies are listed above; validate minimum Ubuntu/Debian and glibc versions, Windows version, macOS versions, CPU/RAM/storage and graphics requirements on clean machines before publishing. Do not present inferred versions as supported minimums.

## Known limitations

- No public release approval, no verified public download URLs, and no exact-merge-SHA artifacts yet.
- macOS Intel runner is configured in the draft workflow but no DMG has completed verification; Apple Silicon likewise pending.
- Windows and macOS clean-machine startup/runtime acceptance is outstanding; Windows/macOS signing and macOS notarization are unresolved.
- Linux package metadata is inspected, but DEB install/uninstall and launcher behavior are not yet demonstrated on a clean Ubuntu/Debian desktop.
- Robotics needs external Python and Edge source checkout and is not self-contained. Hardware, enrollment/MQTT backend integration and physical robot operation are not release-certified.
- checkIk redistribution permission is resolved by the owner grant; no license name is inferred. The source-input SBOM and third-party notices are prepared, but remain pending reconciliation against the exact native CI artifact contents and platform-specific transitive Python dependencies.
- Simulation profile and functionality must be checked against the final artifact bytes before users are directed to download.

## Release gates

- [x] Owner permission for the five original checkIk files is recorded without inventing a license.
- [x] Native draft workflow and four-platform matrix are prepared on `codex/desktop-distribution-handoff`.
- [x] Current GitHub state checked: no Actions run at the requested source SHA, and no `v0.1.0` tag or Release exists.
- [ ] Merge the PR so the new workflow is available on the default branch.
- [ ] Dispatch the draft workflow for the exact source SHA. Confirm all native jobs succeeded and assets are from one run.
- [ ] Inspect package contents and desktop entry/icon; install/open/uninstall DEB and launch AppImage on Ubuntu. Verify Simulation Profile from the installed artifact.
- [ ] Reconcile runner SBOMs/notices against the frozen runtime and packaged Electron application; verify required third-party notices.
- [ ] Fetch Draft assets back and validate every SHA. Record exact names, architectures, checksums, and versioned URLs here only after they are available.
- [ ] Owner reviews and explicitly approves publication. Do not publish automatically.

## Current stop point

GitHub API connectivity and `gh` authentication are restored. The first exact-SHA dispatch failed because electron-builder attempted an implicit publish; workflow change `--publish never` fixed it. Successful exact-SHA run `45564467771` built Windows x64, Ubuntu x64 and macOS arm64, and its checksums/provenance are confirmed. macOS Intel is supported by the new draft workflow but cannot be dispatched until PR #3 is merged because GitHub requires that workflow on the default branch. No v0.1.0 Release or public download URL exists. Ubuntu DEB install/launcher acceptance, Simulation Profile smoke from final artifact, dependency/notices reconciliation, macOS Intel artifact and post-release fetch-back remain pending. Do not publish until those gates pass and you approve. The Draft workflow builds the requested source SHA on native runners and prepares the release files after it is merged. The Draft workflow is not public-release approval.
