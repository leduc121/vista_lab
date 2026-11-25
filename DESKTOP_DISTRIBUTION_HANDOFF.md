# VISTA Lab Station 0.1.0 — Ubuntu Distribution Handoff

**Release state:** GitHub Draft Release v0.1.0 exists and contains the Ubuntu amd64 DEB plus release documentation. It is not public. The Draft was assembled from the successful Ubuntu build artifact in run [45628473427](https://github.com/leduc121/vista_lab/actions/runs/45628473427), because that run's release-assembly job failed on a mismatched artifact directory name. The workflow fix and artifact-scoped notice reconciliation are in targeted PR #6. The final DEB hash is unchanged; no binary rebuild was performed for documentation updates.

## Release artifact

| Field | Verified value |
| --- | --- |
| Version | `0.1.0` |
| Platform / architecture | Ubuntu/Debian Linux `amd64` (x86_64) |
| DEB asset filename | `VISTA.Lab.Station-0.1.0-amd64.deb` |
| Size | `131,395,882` bytes |
| SHA-256 | `a5dbca4d54a28de1aae2f254b08484460efb3db6a3eeee7828d8dc24ea3ba8e4` |
| Desktop source SHA | `80aef01eca657fa8a2dbe3340bac27e048619b11` |
| Main workflow revision | `d3bd155c72c4cbec8b0ea145ea46f1002fef8a82` |
| Build artifact archive SHA-256 | `bfd6d1d4380177ebe5145228e90e468ddc49217e34eab8dc005c6adc248db699` |
| Draft Release URL | https://github.com/leduc121/vista_lab/releases/tag/untagged-c2df6ca831149dc1691e |
| Expected public DEB URL after publish | `https://github.com/leduc121/vista_lab/releases/download/v0.1.0/VISTA.Lab.Station-0.1.0-amd64.deb` — pending publication and verification; not a public download now |
| Local DEB for owner acceptance | `/tmp/vista-draft-download/VISTA.Lab.Station-0.1.0-amd64.deb` |

The Draft contains only the Ubuntu DEB, provenance, release notes, checksums, source-input/binary/runtime SBOMs, third-party notices, license archive, and Ubuntu install/reconciliation notes. No AppImage, Windows, or macOS artifact is included.

## Ubuntu installation

The following commands use the expected public URL. They will work after the owner publishes the Draft; do not present them as a ready public download before then.

```sh
curl -fL "https://github.com/leduc121/vista_lab/releases/download/v0.1.0/VISTA.Lab.Station-0.1.0-amd64.deb" -o vista-lab-station.deb
printf '%s  %s\n' 'a5dbca4d54a28de1aae2f254b08484460efb3db6a3eeee7828d8dc24ea3ba8e4' vista-lab-station.deb | sha256sum -c -
sudo apt install ./vista-lab-station.deb
```

Open from the Ubuntu Application Menu or run:

```sh
gtk-launch vista-lab-station
```

Uninstall:

```sh
sudo apt purge vista-lab-station
```

The package declares `libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0`; APT resolves these dependencies.

## Acceptance status

- CI: native build job succeeded for Ubuntu x64 DEB only. The main workflow's `draft-release` job failed because it expected `release-assets/platforms/ubuntu-x64/`, while `download-artifact` created `release-assets/platforms/vista-desktop-ubuntu-x64/`. The Draft was assembled from the exact successful build artifact; PR #6 corrects the assembler and release filename normalization.
- Provenance: artifact markers and run metadata match Desktop source SHA `80aef01eca657fa8a2dbe3340bac27e048619b11`; the full archive SHA is recorded above. The DEB was downloaded from the Draft and its hash/size recomputed. All `SHA256SUMS` entries passed on the downloaded assets.
- Package: final DEB metadata is package `vista-lab-station`, version `0.1.0`, architecture `amd64`. Its desktop file and hicolor icons (16, 32, 48, 64, 128, 256 px) are present in the package. The exact final DEB has not been installed on the user's Ubuntu desktop because no `sudo` installation was authorized. Earlier install/Simulation/uninstall results used a different DEB hash and do not count for this asset.
- Simulation Profile: packaged runtime acceptance passed on an earlier candidate only. Recheck using the local DEB above before claiming final-binary acceptance.
- Launcher and uninstall: static launcher/icon presence is verified in the final package; actual Application Menu launch and uninstall of this exact hash remain for owner acceptance.
- SBOM/notices: binary SBOM has 47 components; runtime Python SBOM has 18 components/19 dependency relationships and represents the build Python inventory rather than a complete frozen-runtime graph. The release archive now includes exact-version Ubuntu 26.04 copyright records for bundled Ubuntu-origin native libraries and the verbatim CPython 3.11.18 license text. `docs/desktop/UBUNTU_THIRD_PARTY_RECONCILIATION.md` maps the bundled and APT-provided dependency sets, states how each runtime-SBOM entry relates to the final package, and preserves SBOM `NOASSERTION` values where no SPDX assertion was generated. No license is inferred for first-party VISTA code. All Draft assets were re-downloaded and verified against the refreshed `SHA256SUMS` after replacing its notice/archive assets.

## System requirements

- Ubuntu/Debian Linux x86_64 (`amd64`). The native CI runner for this artifact was Ubuntu 26.04.1; confirm installation behavior on the intended Ubuntu release during owner acceptance.
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

- Ubuntu/Debian amd64 DEB only. AppImage is excluded; Windows and macOS are Coming Soon and were not built or tested for v0.1.0.
- Draft downloads are private to the Draft until publication. The expected public URL above is not yet a verified public download.
- Exact final-DEB installation, Simulation Profile, Application Menu launch, and uninstall require owner acceptance on Ubuntu.
- Third-party evidence is attached for the binary-SBOM components identified in the reconciliation document. Keep SBOM `NOASSERTION` values intact; the accompanying verbatim copyright/license records are evidence, not rewritten SPDX assertions. Review the updated Draft notice/archive assets and checksum manifest before publication.
- Robotics requires an external Edge checkout and Python environment. Physical robot operation is not certified.
