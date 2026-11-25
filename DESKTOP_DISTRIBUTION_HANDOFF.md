# VISTA Desktop 0.1.0 distribution handoff

**Status: release blocked; no public downloads.** Prepared 2026-11-25 for Claude Code. Development is frozen at merge `80aef01eca657fa8a2dbe3340bac27e048619b11`. No release was published and no Web SKYNET-Thesis/se repository was changed.

## Release summary and platform matrix

| Platform / architecture | Requested artifact | Candidate filename | SHA-256 (local staged candidate) | Download status |
| --- | --- | --- | --- | --- |
| Windows x64 | NSIS `.exe` | Expected from current builder config: `VISTA Lab Station-0.1.0-x64-setup.exe` | **Pending** | **Pending**: CI API unavailable. Old local staged file has a different filename/build and must not be substituted. |
| Ubuntu/Debian amd64 | `.deb` | Expected from current builder config: `VISTA Lab Station-0.1.0-amd64.deb` | **Pending** | **Pending**: CI API unavailable. Old local staged file has a different filename/build and must not be substituted. |
| Linux x86_64 | AppImage | Expected from current builder config: `VISTA Lab Station-0.1.0-x86_64.AppImage` | **Pending** | **Pending**: CI API unavailable. Old local staged file has a different filename/build and must not be substituted. |
| macOS Intel x64 | `.dmg` | Expected: `VISTA-Lab-Station-0.1.0-x64.dmg` | Pending | **Blocked**: native workflow has no Intel macOS job; no artifact found. |
| macOS Apple Silicon arm64 | `.dmg` | Expected: `VISTA-Lab-Station-0.1.0-arm64.dmg` | Pending | **Pending**: workflow targets `macos-15` arm64, but no DMG is in the local release stage and exact merge-SHA artifact verification is unavailable. |

The tracked `releases/v0.1.0/` contains older filenames and hashes; its manifest is not evidence for the merge SHA. `scripts/validate-download-release.cjs` only verifies internal consistency of that old local stage. Those files do not match the current builder's expected output names, and their Linux hashes differ from files in ignored `dist/`. Do not publish or combine any of these files with CI outputs. Generate final SHA values and `SHA256SUMS` only from the exact verified CI artifacts downloaded from one Actions run at the merge SHA.

### Versioned download URL plan

There are **no verified download URLs**. Do not put download links on the website. The GitHub API could not be reached during handoff preparation, and no public release was confirmed. After a draft release is reviewed and explicitly approved, GitHub's versioned URL pattern will be:

```text
https://github.com/leduc121/vista_lab/releases/download/v0.1.0/<exact-filename>
```

Do not use this pattern as a live link until the asset is uploaded and fetched back from GitHub with matching SHA-256. Do not create a `latest` alias for this capstone handoff.

## CI and release integrity

- Checkout `HEAD` is exactly `80aef01eca657fa8a2dbe3340bac27e048619b11` and branch is `main` tracking `origin/main`.
- `.github/workflows/native-build.yml` builds Linux x64 (AppImage + DEB), Windows x64 (NSIS), and macOS arm64 (DMG). It does **not** build macOS Intel. It uploads build outputs as workflow artifacts; it does not create a GitHub Release or bind uploaded files to a release tag.
- `docs/desktop/DESKTOP_FULL_ACCEPTANCE.md` records a prior successful native run `45169792218` for Linux, Windows and macOS ARM64 packaging. Direct GitHub API queries failed with `error connecting to api.github.com`. The run's head SHA, status, artifact availability, and association with this merge therefore remain **unverified**.
- The checked-in `releases/v0.1.0/manifest.json` and `SHA256SUMS` cover three candidates only. The manifest records `release-candidate-not-publicly-approved`, unsigned packages, and macOS unavailable.
- Current GitHub Release/tag state and all live download URLs remain **pending** because GitHub API connectivity was unavailable.
- Required before release: follow the manual GitHub Web procedure below; download selected assets from one run whose commit is exactly the merge SHA; inspect and validate each artifact; clear distribution rights; complete platform acceptance; decide signing; generate final notes and `SHA256SUMS`; then create a draft release for owner review. If workflow/packaging changes are needed, use a separate fix branch and PR; do not push to `main`.

### Manual GitHub Web procedure (API is blocked)

Open repository `leduc121/vista_lab` → **Actions** → **Native desktop acceptance**. Inspect candidate runs and accept only a **successful** run whose displayed full commit SHA equals `80aef01eca657fa8a2dbe3340bac27e048619b11` and whose Linux, Windows, and macOS ARM64 jobs all passed. Do not guess a run ID. A run from another SHA, a partial rerun with mixed commits, an expired artifact, or missing output is not usable. If there is no matching run, stop; do not rebuild under this handoff.

Download artifacts from that one run: `vista-lab-station-ubuntu-latest`, `vista-lab-station-windows-latest`, and `vista-lab-station-macos-15`. For the minimum release use only the Windows `.exe` and Linux `.deb` + `.AppImage` from that same run. Keep each download segregated and verify archive contents. Current `package.json` predicts the filenames in the matrix, but confirm the names and bytes inside the downloaded archives. macOS ARM64 is optional only if the same run has its `.dmg`; no Intel macOS job exists. Never substitute local `dist/` or `releases/v0.1.0/` files.

After verifying selected assets, copy only those exact files into a clean staging directory and generate checksums there. On Ubuntu:

```sh
cd /path/to/clean-release-stage
find . -maxdepth 1 -type f \( -name '*.exe' -o -name '*.deb' -o -name '*.AppImage' \) -print | sort
test "$(find . -maxdepth 1 -type f -name '*.exe' | wc -l)" -eq 1
test "$(find . -maxdepth 1 -type f -name '*.deb' | wc -l)" -eq 1
test "$(find . -maxdepth 1 -type f -name '*.AppImage' | wc -l)" -eq 1
sha256sum -- *.exe *.deb *.AppImage > SHA256SUMS
sha256sum -c SHA256SUMS
```

These outputs are the release's SHA values; the previous staged `SHA256SUMS` is not reusable. Upload the same files and sums to the draft release, fetch them back, and compare each digest.

To create a draft manually: repository → **Releases** → **Draft a new release**. Check first whether tag `v0.1.0` exists. If it exists, verify it targets the exact merge SHA; never move an existing public tag. Otherwise create `v0.1.0` targeting the exact merge commit. Set title `VISTA Lab Station 0.1.0`, attach only verified assets and matching `SHA256SUMS`, paste final release notes, then save as **Draft**. Do not press **Publish release** until legal and acceptance blockers are cleared and release owner explicitly approves.

### Draft release notes (not for publication until gates clear)

**VISTA Lab Station 0.1.0** is a desktop environment for assigned lab work, Blockly exercises, local SO-101 MuJoCo simulation, and a separately configured robotics runtime. The simulation profile does not command physical hardware. Robotics profile requires operator-supplied Python and an authorized Edge source checkout. Installer availability, platform support, code signing and asset/dependency notices must be finalized against the attached, verified release assets before publishing these notes.

## Source and dependency distribution rights

- `models/so101` carries the upstream MuJoCo Menagerie / Robot Studio model README and Apache-2.0 license. `renderer/assets/so101` carries its LICENSE and NOTICE. See [asset provenance](docs/desktop/ASSET_PROVENANCE.md).
- **checkIk owner permission is confirmed.** The owner confirmed that they own the checkIk source and authorize integration, modification, packaging, and redistribution as part of VISTA Lab Station, with no additional attribution or notice required for their original code. No named SPDX license is assigned. Five files are reused under `edge/checkik_kinematics/`: `__init__.py`, `ik.py`, `kinematics.py`, `safety.py`, and `so101_new_calib.urdf`; the exact provenance and SHA-256 values are recorded in [third-party notices](docs/desktop/THIRD_PARTY_NOTICES.md) and the CycloneDX SBOM. Runtime imports these files and packages them through the frozen Edge runtime. The rest of the separate ignored checkIk checkout is not included.
- `package-lock.json` and the direct Python dependency inventory are represented in the prepared source-input SBOM/notices. Electron/Chromium and MuJoCo license texts are documented. The Python runtime resolves transitive versions per native CI job, so dependency redistribution is **not yet fully verified against final installer contents**; reconcile exact artifact contents before publication.
- Windows/macOS artifacts are unsigned according to the current candidate manifest; signing/notarization policy and its effect on final hashes are unresolved.

## Linux installation and website command snippets

The following are **templates only**, not live download instructions: exact-SHA filenames, checksum values and URLs are pending. Do not put them on the website until files from the verified CI run are uploaded and their `SHA256SUMS` is confirmed.

### Ubuntu/Debian `.deb`

```sh
set -eu
file='VISTA Lab Station-0.1.0-amd64.deb' # replace with verified filename from exact-SHA CI run
url='<verified GitHub Release asset URL>' # fill only after asset is uploaded and fetched back
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
url='<verified GitHub Release asset URL>'
expected='<SHA256 from that release SHA256SUMS>'
curl --fail --location --proto '=https' --proto-redir '=https' -o "$file" "$url"
printf '%s  %s\n' "$expected" "$file" | sha256sum -c -
chmod +x "$file"
"$PWD/$file"
```

The tracked `releases/v0.1.0/install-linux.sh` also pins the candidate Linux hashes and supports `--appimage` and `--deb`. Its remote installation mode requires the approved HTTPS downloads root; it refuses plain HTTP and checks the SHA-256 before install. AppImage installs into the current user's data directory and does not need sudo. Remove its installed file at `${XDG_DATA_HOME:-$HOME/.local/share}/vista-lab-station/v0.1.0/VISTA-Lab-Station-0.1.0-x86_64.AppImage`. The script does not create a launcher entry for AppImage; run the file directly. Do not imply launcher integration is tested.

**Linux acceptance status:** old candidate DEB desktop file/icon paths were inspected. Existing docs record AppImage/extracted-DEB launch smoke on a development host, not a clean system install. For exact-SHA CI package acceptance, install the DEB then launch it via the app launcher or `gtk-launch vista-lab-station`; uninstall using `sudo apt remove vista-lab-station`. For AppImage, launch `./<verified-AppImage>` and uninstall by deleting that downloaded file. Launcher opening, icon rendering and uninstall are not yet verified; do not claim a pass.

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

- No public release approval, no verified public download URLs, and no verified exact-merge-SHA assets.
- macOS Intel package missing. macOS Apple Silicon package not locally staged or independently verified.
- Windows and macOS clean-machine startup/runtime acceptance is outstanding; Windows/macOS signing and macOS notarization are unresolved.
- Linux package metadata is inspected, but DEB install/uninstall and launcher behavior are not yet demonstrated on a clean Ubuntu/Debian desktop.
- Robotics needs external Python and Edge source checkout and is not self-contained. Hardware, enrollment/MQTT backend integration and physical robot operation are not release-certified.
- checkIk redistribution permission is resolved by the owner grant; no license name is inferred. The source-input SBOM and third-party notices are prepared, but remain pending reconciliation against the exact native CI artifact contents and platform-specific transitive Python dependencies.
- Simulation profile and functionality must be checked against the final artifact bytes before users are directed to download.

## Release gate checklist

- [ ] Verify successful native CI jobs have `head_sha` equal to `80aef01eca657fa8a2dbe3340bac27e048619b11` and retrieve their retained artifacts.
- [ ] Add a macOS Intel native job and obtain x64 DMG, if Intel support remains in scope; verify arm64 DMG.
- [ ] Verify each final artifact's platform/architecture, filename, SHA-256, package contents, Simulation Profile, launcher and uninstall on clean target systems.
- [x] Record owner authorization for the five reused checkIk files without assigning a named license.
- [ ] Reconcile prepared source-input SBOM/notices with exact-SHA native artifacts and resolved transitive Python dependencies.
- [ ] Decide signing/notarization; if signed, recalculate all hashes after signing.
- [ ] Update release manifest, `SHA256SUMS`, release notes and this handoff from final artifacts; create a draft v0.1.0 Release only after artifact evidence is assembled.
- [ ] Validate every versioned download URL and checksum from a clean client; then provide website commands/links to Web owner. Publish only after explicit approval.

## Current stop point

GitHub API is blocked from this environment, so native CI and artifacts for the exact merge SHA cannot be identified or validated. Existing staged files and sums are from another candidate and must not be reused. The five reused checkIk files are included in the packaged runtime. Their owner explicitly authorized redistribution for VISTA Lab Station; no SPDX license was assigned. Do not publish `v0.1.0` until the exact-SHA CI artifacts are identified, their contents and native dependency closure are checked, and the artifact-specific SBOM/notices and checksums are finalized. The GitHub Web procedure above is the manual provenance path; it does not authorize publication.
