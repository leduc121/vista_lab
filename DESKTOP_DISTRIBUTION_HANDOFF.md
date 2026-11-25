# VISTA Lab Station 0.1.0 — Ubuntu Distribution Handoff

**Current state:** PR #5 is open. Ubuntu-only CI candidate completed successfully from PR head `e5d51137165bb6d50ad4e7e6e07b82b17ead45cf`; its single DEB was built from Desktop source SHA `80aef01eca657fa8a2dbe3340bac27e048619b11`. No Draft Release exists because the workflow must be dispatched from `main` after PR #5 is merged. Candidate values below are not final release metadata. Do not show a download-ready link on VISTA Web until the main-branch Draft asset is fetched back and independently checksum-verified.

## Release scope

- Version: `0.1.0`
- Supported package: Ubuntu/Debian Linux `amd64`
- Installer: `VISTA Lab Station-0.1.0-amd64.deb`
- Windows and macOS: **Coming Soon**; not built or tested for this Ubuntu-only release.
- AppImage: not included.
- Desktop application source: `80aef01eca657fa8a2dbe3340bac27e048619b11`.

## Release asset status

| Field | Value |
| --- | --- |
| DEB filename | `VISTA Lab Station-0.1.0-amd64.deb` |
| Candidate size | 131,403,604 bytes (Ubuntu-only PR validation run; not final Draft asset) |
| Candidate SHA-256 | `04f1288624cb8a6ffe2805f3bd7fe34779818ec99e6d73d6f8e686ba247f04fb` (locally recomputed; not final Draft asset) |
| Draft Release URL | Pending PR #5 merge and successful main workflow run |
| Public download URL | Pending owner publication and fetch-back verification |
| Expected stable asset path | `https://github.com/leduc121/vista_lab/releases/download/v0.1.0/VISTA%20Lab%20Station-0.1.0-amd64.deb` — anticipated only; not a valid download until published and verified |

Ubuntu-only validation run: [45587950482](https://github.com/leduc121/vista_lab/actions/runs/45587950482), head `e5d51137165bb6d50ad4e7e6e07b82b17ead45cf`, source marker `80aef01eca657fa8a2dbe3340bac27e048619b11`, platform marker `ubuntu-x64`. Only job `build (ubuntu-x64, ubuntu-latest, --linux deb --x64)` succeeded; Draft assembly was intentionally skipped. The uploaded artifact archive SHA-256 was `bf4d67ede3fc49da83655b4edbee067f5e27ae0ed337ae716e1f47541752c48b`; the DEB extracted from it has the candidate SHA-256 and size above. This is not a release asset. Do not mix it with artifacts from other CI runs.

## Ubuntu installation

### Option A — download and open the installer

Download `VISTA Lab Station-0.1.0-amd64.deb` from the published v0.1.0 Release, then open the file in Ubuntu Software or install it with:

```sh
sudo apt install ./VISTA\ Lab\ Station-0.1.0-amd64.deb
```

### Option B — terminal download and install

The command below becomes ready to copy after the Release is published and the asset URL and SHA-256 have been verified. The URL is intentionally pending until then.

```sh
curl -fL "<VERIFIED_PUBLIC_RELEASE_ASSET_URL>" -o vista-lab-station.deb
printf '%s  %s\n' '<VERIFIED_DEB_SHA256>' vista-lab-station.deb | sha256sum -c -
sudo apt install ./vista-lab-station.deb
```

After installation, search for **VISTA Lab Station** in Ubuntu's Application Menu or launch from a terminal:

```sh
gtk-launch vista-lab-station
```

Uninstall:

```sh
sudo apt purge vista-lab-station
```

For Ubuntu-only candidate `45587950482`, package installation succeeded in an isolated Ubuntu 24.04 amd64 container. The DEB declares its GTK/desktop shared-library dependencies; `desktop-file-validate` passed for `/usr/share/applications/vista-lab-station.desktop`; hicolor icons were present at 16, 32, 48, 64, 128 and 256 px. Simulation Profile runtime health passed (MuJoCo available; allowlisted local SO-101 home simulation produced 19 frames with `motionEnabled=false`). `apt purge vista-lab-station` then removed the package, desktop entry, icon and `/opt/VISTA Lab Station`. Container restrictions prevented a normal Chromium sandbox launch through the desktop session; menu launch is not yet accepted on a real Ubuntu desktop. Repeat all checks against the final Draft asset after main workflow creation.

## System requirements

- Ubuntu/Debian Linux on 64-bit x86 (`amd64`). Ubuntu 24.04 amd64 was the isolated acceptance environment.
- Install any additional shared-library dependencies through `apt`; the DEB declares its package dependencies. Confirm the exact `Depends` field from the final Draft package before publishing minimum OS claims.
- CPU/RAM, disk, GPU and minimum Ubuntu versions beyond the acceptance environment have not been established. Do not advertise unsupported minimum requirements.
- Internet is needed to download the installer. Simulation runs locally after installation.

## Runtime profiles

### Simulation Profile

Simulation uses the packaged Edge runtime and SO-101 MuJoCo scene. The exact-source DEB from main run `45581975447` passed an isolated simulation check with 19 frames and `motionEnabled=false`. Recheck the final Draft bytes.

### Robotics Profile

Robotics is optional and is not self-contained. It needs an operator-selected Python 3.12 environment and an authorized VISTA Edge source checkout containing `edge/runtime.py`. The locked setup is:

```sh
uv python install 3.12.14
uv sync --locked --project edge/robot-runtime --python 3.12.14
uv pip check --python edge/robot-runtime/.venv/bin/python
```

In Desktop Settings, select `edge/robot-runtime/.venv/bin/python` and the Edge checkout root. This uses an isolated virtual environment; do not install dependencies into system Python. No model checkpoint or CUDA is installed or downloaded by Desktop. Hardware operation is not certified by this release.

## SBOM, notices and provenance

Candidate run `45587950482` contains a 47-component CycloneDX native-package SBOM, an 18-component/19-edge Python runtime SBOM, and a 584-entry license/notice archive whose ZIP integrity check passed. The Debian package itself contains the packaged runtime; `dpkg-deb` reports package `vista-lab-station`, version `0.1.0`, architecture `amd64`, and declared dependencies `libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0`. The source `THIRD_PARTY_NOTICES.md` still explicitly says its inventory is not artifact-complete and asks for reconciliation. Treat dependency-license closure as a release blocker until that caveat is resolved against the Ubuntu-only binary SBOM, runtime SBOM and archive and the final asset hashes match. checkIk owner authorization and the five reused files are recorded; no SPDX license is inferred for those original files.

## Known limitations

- Only Ubuntu/Debian amd64 DEB is in v0.1.0. AppImage is excluded. Windows and macOS are Coming Soon and were not built or tested for this scope.
- No Draft Release exists yet; PR #5 must be merged before main workflow dispatch. The expected stable asset path above is not live or verified.
- The Ubuntu-only candidate DEB was tested in an isolated Ubuntu 24.04 container. Package install, desktop file validation, icon presence, Simulation Profile, and uninstall passed. Standard desktop-session menu launch remains unverified because the container blocked Chromium sandbox startup; confirm on Ubuntu desktop before publication.
- Robotics needs external Python and Edge checkout. Physical robot operation, enrollment, and cloud integration are not certified.
- Do not use candidate checksums as final checksums unless they exactly match the Ubuntu-only Draft asset and GitHub fetch-back.
