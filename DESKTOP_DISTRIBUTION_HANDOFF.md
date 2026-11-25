# VISTA Lab Station 0.1.0 — Ubuntu Distribution Handoff

**Current state:** Ubuntu-only Draft release is pending. PR #5 is open and being updated to build only Ubuntu amd64 DEB. No Draft Release or public download URL exists yet. Do not put a download URL on VISTA Web until the Draft is published and the asset has been downloaded back and checksum-verified.

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
| File size | Pending Ubuntu-only release run |
| SHA-256 | Pending Ubuntu-only release run and fetch-back verification |
| Draft Release URL | Pending successful Draft creation |
| Public download URL | Pending owner publication and fetch-back verification |
| Stable asset URL after publish | Pending; do not use before verified |

The earlier main run `45581975447` built the same source with DEB and AppImage targets, then failed assembly; its DEB SHA-256 was `980953e0493083a627f447eb7dc422d11045c262a6f91ce9fb7acde39763e841` (131,397,496 bytes). This is candidate evidence only, not the Ubuntu-only Draft asset. Use that hash only if the Ubuntu-only run and final Draft asset match it exactly.

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

The DEB from main run `45581975447` installed successfully in an isolated Ubuntu 24.04 amd64 container. Its desktop entry passed `desktop-file-validate`, the Application Menu entry and hicolor icons (16, 32, 48, 64, 128 and 256 px) were installed, and `apt purge` removed the package, launcher and application files. Packaged Simulation Profile acceptance passed: MuJoCo reported available, an allowlisted local SO-101 home simulation produced 19 frames, and `motionEnabled=false`. The Ubuntu launcher command path and icon were verified; opening through a desktop session remains to be confirmed outside Docker because its user namespaces prevent normal Chromium sandbox startup. Repeat acceptance against the exact Ubuntu-only Draft asset before publication.

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

The Ubuntu-only Draft workflow will attach the DEB binary CycloneDX SBOM, runtime Python SBOM, third-party license archive, source-input SBOM, consolidated `THIRD_PARTY_NOTICES.md`, Ubuntu installation note, build provenance, release notes and `SHA256SUMS`. Final binary closure and notices are pending review of the Ubuntu-only artifact and Draft. checkIk owner authorization and five reused files are recorded in the notices; no SPDX license is inferred for that original code. Third-party dependency licenses remain applicable.

## Known limitations

- Only Ubuntu/Debian amd64 DEB is in v0.1.0. AppImage is excluded. Windows and macOS are Coming Soon and were not built or tested for this scope.
- No Draft Release or verified public URL exists yet.
- The DEB has been tested in an isolated Ubuntu 24.04 container. Standard desktop-session launcher startup should be confirmed on an Ubuntu desktop before publication.
- Robotics needs external Python and Edge checkout. Physical robot operation, enrollment, and cloud integration are not certified.
- Do not use candidate checksums as final checksums unless they exactly match the Ubuntu-only Draft asset and GitHub fetch-back.
