# VISTA Desktop 0.1.0 distribution handoff

**Status: automation prepared on `codex/desktop-distribution-handoff`; no public downloads.** Updated 2026-11-25 for Claude Code. Desktop package source remains merge `80aef01eca657fa8a2dbe3340bac27e048619b11`. This branch adds release automation and documents only; no app functionality, safety, or WF03 behavior was changed. No public release was created and Web SKYNET-Thesis/se was not changed.

## Release summary and platform matrix

| Platform / architecture | Requested artifact | Candidate filename | SHA-256 (payload, candidate run `45570937327`) | Download status |
| --- | --- | --- | --- | --- |
| Windows x64 | NSIS `.exe` | `VISTA Lab Station-0.1.0-x64-setup.exe` | `e000451b224349ad2f74251952007c227cf3e36adcf6e506abc8c662d52f0412` | Candidate from same-source run `45570937327`; payload SHA recomputed locally; GitHub artifact archive digest matched. No Draft asset URL yet. |
| Ubuntu/Debian amd64 | `.deb` | `VISTA Lab Station-0.1.0-amd64.deb` | `287feaec78fade1b922409bb5f23a956fa3007468e8075dd15d59f22f0a090db` | Candidate from same-source run `45570937327`; payload SHA recomputed locally; installed/inspected in Ubuntu 24.04 container. No Draft asset URL yet. |
| Linux x86_64 | AppImage | `VISTA Lab Station-0.1.0-x86_64.AppImage` | `57f20261b908297917e7fc94d2096bb7704adce74a347cd0336d4ab26ea4e5ac` | Candidate from same-source run `45570937327`; payload SHA recomputed locally; launched under Xvfb in Ubuntu 24.04 container. No Draft asset URL yet. |
| macOS Intel x64 | `.dmg` | — | **Not supported in this release** | `mujoco==3.17.0` has no CPython 3.11 Intel macOS wheel; native build attempted source compilation and failed because `MUJOCO_PATH` was unavailable. No Intel artifact will be included. |
| macOS Apple Silicon arm64 | `.dmg` | `VISTA Lab Station-0.1.0-arm64.dmg` | `a92dff1e4821767845f768278e510b309f608933508360539198b5694ba9daf8` | Candidate from same-source run `45570937327`; payload SHA recomputed locally; GitHub artifact archive digest matched. No Draft asset URL yet. |

These are **candidate** payload SHA-256 values, recomputed from locally downloaded installers from workflow run `45570937327`. All three downloaded GitHub artifact ZIP SHA-256 digests also matched the Actions API `digest`; each embedded `source-sha.txt` is `80aef01eca657fa8a2dbe3340bac27e048619b11`, and the platform markers match Windows x64, Ubuntu x64 and macOS arm64. This workflow was dispatched from the unmerged fix branch with Draft creation disabled, so the files are not final Release assets. Do not mix them with run `45564467771` or another run. The tracked `releases/v0.1.0/` contains older filenames and hashes; it is not evidence for this source SHA. The merged-main Draft workflow must produce one new complete run, after PR #4 is merged, and its final `SHA256SUMS`/payload hashes must be recomputed and recorded separately.

### Versioned download URL plan

There are **no verified public download URLs**. Do not put download links on the website. Exact-SHA Actions artifacts exist, but no GitHub Release assets exist yet. After a Draft is reviewed, approved, published, and downloaded back with matching hashes, GitHub's versioned URL pattern will be:

```text
https://github.com/leduc121/vista_lab/releases/download/v0.1.0/<exact-filename>
```

Do not use this pattern as a live link until the asset is uploaded and fetched back from GitHub with matching SHA-256. Do not create a `latest` alias for this capstone handoff.

## CI and release integrity

- **Package source SHA:** `80aef01eca657fa8a2dbe3340bac27e048619b11`. Candidate run `45570937327` on the authorized fix branch used this exact input SHA. The `main`-branch Draft run is pending PR #4 merge. No public v0.1.0 URL is verified.
- The existing `.github/workflows/native-build.yml` supports Windows x64 NSIS, Linux x64 DEB + AppImage, and macOS arm64 DMG. It now accepts an explicit source SHA, records it into each artifact, and forces `--publish never`; it does not include Intel macOS or Release creation.
- New `.github/workflows/desktop-release-draft.yml` runs Windows x64, Linux x64 and macOS arm64 native platform jobs from one required source SHA, tags each artifact with its source SHA/platform, gathers artifacts from the same workflow run, generates `SHA256SUMS`, and creates only a **Draft** when manually dispatched with `create_draft=true`. It never publishes. Draft creation fails if a required artifact is missing, provenance differs, or a `v0.1.0` release/tag conflicts with the requested source commit. Windows Python inventory capture uses UTF-8 mode to avoid Windows console encoding failures.
- Each native job attaches a CycloneDX inventory of its pip build environment. The release also attaches the source-input SBOM and notices. These are transparent inventories, not yet proof of the exact binary dependency closure or clean-machine acceptance; do not publish until that reconciliation and acceptance evidence are recorded.
- PR #4 must be merged before the corrected workflow is available on `main`. Then dispatch **Desktop release draft** on `main` with `source_sha=80aef01eca657fa8a2dbe3340bac27e048619b11`, `create_draft=true`. A failed runner blocks the collector and draft creation.

### Draft release procedure

After PR #4 is merged: repository `leduc121/vista_lab` → **Actions** → **Desktop release draft** → **Run workflow**. Enter the exact `source_sha` above and keep `create_draft` enabled. Wait for the Windows x64, Linux x64, macOS arm64 and `draft-release` jobs to succeed. Verify Draft assets against `SHA256SUMS` and fetch them back for another digest check. Do not use files from `dist/`, `releases/v0.1.0/` or candidate run `45570937327` as Draft assets.

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
file='VISTA Lab Station-0.1.0-amd64.deb'
url='<PENDING: exact URL appears only after the v0.1.0 Draft is approved and published>' # not a live URL
expected='287feaec78fade1b922409bb5f23a956fa3007468e8075dd15d59f22f0a090db'
curl --fail --location --proto '=https' --proto-redir '=https' -o "$file" "$url"
printf '%s  %s\n' "$expected" "$file" | sha256sum -c -
sudo apt install "./$file"
gtk-launch vista-lab-station
```

Uninstall with `sudo apt purge vista-lab-station`. The candidate DEB declared its dependencies through package metadata and installed `/usr/share/applications/vista-lab-station.desktop` with `Icon=vista-lab-station`; hicolor PNG icons from 16×16 to 256×256 were present. The candidate's `desktop-file-validate`, install and purge passed in the isolated Ubuntu container. The later `main` Draft assets still require acceptance and hash verification.

### Linux AppImage

```sh
set -eu
file='VISTA Lab Station-0.1.0-x86_64.AppImage'
url='<PENDING: exact URL appears only after the v0.1.0 Draft is approved and published>'
expected='57f20261b908297917e7fc94d2096bb7704adce74a347cd0336d4ab26ea4e5ac'
curl --fail --location --proto '=https' --proto-redir '=https' -o "$file" "$url"
printf '%s  %s\n' "$expected" "$file" | sha256sum -c -
chmod +x "$file"
"$PWD/$file"
```

The tracked `releases/v0.1.0/install-linux.sh` also pins an older Linux candidate and supports `--appimage` and `--deb`; do not use its hashes for this run. Its remote mode requires an approved HTTPS downloads root and checks SHA-256. The verified candidate AppImage launched directly; it does not register a launcher entry. Remove the downloaded file to uninstall it.

**Linux acceptance status for candidate run `45570937327`:** Ubuntu 24.04 x86_64 container reported package `vista-lab-station 0.1.0 amd64`; apt resolved the declared dependencies and installed it. `desktop-file-validate` passed, the desktop file uses `Icon=vista-lab-station`, hicolor PNG icons from 16×16 to 256×256 were installed, and the bundled Edge executable plus SO-101 scene were present. `apt purge vista-lab-station` removed the package, launcher entry, binary and installation path. The packaged Edge runtime returned version 0.1.0 with MuJoCo simulation available; an allowlisted local gripper simulation completed with `motionEnabled=false` and 11 frames. The AppImage extracted and the Electron process remained open under Xvfb for the 20-second smoke window. Docker denies Linux user namespaces, so normal Chromium sandbox startup through `gtk-launch` could not be established there; direct app startup with `--no-sandbox` worked. This is acceptance evidence for the exact-source candidate, not yet the later `main` Draft run. AppImage removal is deleting the downloaded file; it does not register a launcher entry.

Before installing the eventual Draft DEB, verify its package metadata, desktop entry and icon:

```sh
dpkg-deb --field "$file" Package Version Architecture Depends
dpkg-deb --contents "$file" | grep -E 'usr/share/applications/.*desktop|usr/share/icons/.*vista-lab-station'
```

After installation, run `desktop-file-validate /usr/share/applications/vista-lab-station.desktop`, confirm the icon resolves, then test `gtk-launch vista-lab-station`. After testing run `sudo apt purge vista-lab-station` and confirm removal. For AppImage, launch the downloaded file directly and uninstall by deleting it. Repeat these checks against the eventual `main` Draft assets.

## Runtime profiles and system requirements

- **Simulation:** the CI workflow runs `npm run build:edge-runtime` before Electron Builder; package config adds `edge/dist/vista-edge-runtime` and `models/so101` as extra resources. The exact-source candidate Linux DEB contained both; its packaged Edge runtime reported MuJoCo available and completed a local simulation in an Ubuntu 24.04 container. Recheck the eventual `main` Draft artifacts before treating those bytes as release evidence.
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

- No Draft/public release approval or verified public download URLs. Candidate run `45570937327` contains Windows, Linux and macOS arm64 from one source SHA/run, with local payload hashes and matching GitHub archive digests. It is not the final main workflow run and must not be mixed with any future run. macOS Intel is omitted because pinned MuJoCo does not provide an Intel macOS wheel for the build Python; changing the runtime dependency is out of scope.
- Windows and macOS clean-machine startup/runtime acceptance is outstanding; Windows/macOS signing and macOS notarization are unresolved.
- Linux DEB install, metadata, desktop-file validation, icon registration, purge/uninstall and packaged Simulation Profile passed in an isolated Ubuntu 24.04 container for the candidate run. AppImage launched under Xvfb. Default sandboxed GTK launch remains inconclusive because Docker denies user namespaces; test again on a standard Ubuntu desktop before publication.
- Robotics needs external Python and Edge source checkout and is not self-contained. Hardware, enrollment/MQTT backend integration and physical robot operation are not release-certified.
- checkIk redistribution permission is resolved by the owner grant; no license name is inferred. The source-input SBOM and third-party notices are prepared, but remain pending reconciliation against the exact native CI artifact contents and platform-specific transitive Python dependencies.
- Simulation profile and functionality must be checked against the final artifact bytes before users are directed to download.

## Release gates

- [x] Owner permission for the five original checkIk files is recorded without inventing a license.
- [x] Corrected native draft workflow and three-platform matrix are prepared on `codex/desktop-distribution-handoff`; Intel macOS is excluded due to the pinned dependency lacking an Intel wheel.
- [x] Current GitHub state checked: no Actions run at the requested source SHA, and no `v0.1.0` tag or Release exists.
- [x] PR #3 merged. PR #4 corrects Windows UTF-8 inventory output and excludes unsupported Intel macOS. PR #4 must be merged for the corrected workflow on `main`.
- [x] Candidate run `45570937327` passed Windows x64, Ubuntu x64, macOS arm64; provenance source SHA and each artifact platform marker match. All three archive digests matched GitHub API; installer payload SHA-256 values were recomputed locally.
- [x] Candidate Ubuntu DEB package contents, launcher entry/icon, install/purge and packaged Simulation Profile were inspected in an isolated Ubuntu 24.04 container. AppImage launched under Xvfb; normal Chromium sandbox through GTK remains unverified in Docker.
- [ ] Dispatch the corrected Draft workflow from `main` for the exact source SHA. Verify all native jobs and all assets from that one new run.
- [ ] Reconcile runner SBOMs/notices against the frozen runtime and packaged Electron application; verify required third-party notices.
- [ ] Fetch Draft assets back and validate every SHA. Record exact names, architectures, checksums, and versioned URLs here only after they are available.
- [ ] Owner reviews and explicitly approves publication. Do not publish automatically.

## Current stop point

GitHub authentication works; the network transfer can be slow/intermittent. PR #3 merged at `8d9ca08d63f636f2a633e134c3dca6fa4b659c4a`. Failed run `45570240949` was cancelled and must not be used. PR #4 (`b91d00f7b3639a528f333f5582082d81056e7976`) is OPEN, CLEAN and all native checks pass; it fixes Windows inventory UTF-8 and removes unsupported Intel macOS. Corrected candidate run `45570937327`, dispatched on that branch with `create_draft=false`, passed Windows x64, Ubuntu x64 and macOS arm64 from source SHA `80aef01eca657fa8a2dbe3340bac27e048619b11`. Artifact archive digests matched GitHub API and actual installer payload SHA-256 was recomputed. Ubuntu DEB install, package contents, desktop file/icon, purge and packaged simulation passed; AppImage opened under Xvfb. Do not reuse these branch-run files as Draft assets. PR #4 must be merged before running the corrected workflow from `main`. Per-platform resolved runtime SBOM/notices are still build-environment inventories and need reconciliation against final binary dependency closure. Draft asset fetch-back and publication remain pending; no public Release was created.
