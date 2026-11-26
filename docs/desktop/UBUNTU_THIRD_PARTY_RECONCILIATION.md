# Ubuntu v0.1.0 third-party reconciliation

**Freeze status (2026-11-25):** this reconciliation remains valid only for the original Draft asset SHA-256 `a5dbca4d54a28de1aae2f254b08484460efb3db6a3eeee7828d8dc24ea3ba8e4`. The separate corrected workspace candidate (`8eb5d74c23a3be4d2164f7e58bbbb0938467240cead40eabc328e846a29309b4`) has not had a new binary SBOM or package-tree/license-archive reconciliation generated. Do not attach this old artifact-specific SBOM/archive to the corrected candidate. Keep all existing `NOASSERTION` values; no license is inferred by this note.

Status: artifact-scoped reconciliation for the existing Ubuntu amd64 Draft Release. This document covers the DEB identified below; it does not represent legal advice or infer licenses from names.

## Artifact and provenance

| Field | Value |
| --- | --- |
| Version / architecture | `0.1.0` / Ubuntu amd64 (`x86_64`) |
| Asset | `VISTA.Lab.Station-0.1.0-amd64.deb` |
| SHA-256 / size | `a5dbca4d54a28de1aae2f254b08484460efb3db6a3eeee7828d8dc24ea3ba8e4` / 131,395,882 bytes |
| Application source SHA | `80aef01eca657fa8a2dbe3340bac27e048619b11` |
| Native CI run | [45628473427](https://github.com/leduc121/vista_lab/actions/runs/45628473427), Ubuntu x64 build job succeeded |
| Build OS | Runner log reports Ubuntu 26.04.1 LTS, image `ubuntu-26.04` version `20261116.202.1` |
| Binary SBOM | `ubuntu-x64-binary-sbom.cdx.json` (47 components, including file-level inventory) |
| Runtime SBOM | `ubuntu-x64-runtime-python-sbom.cdx.json` (18 components, 19 relationships; build Python inventory, not a complete frozen-runtime dependency graph) |
| License archive | `ubuntu-x64-THIRD_PARTY_LICENSES.zip`; original 584 collected files plus verbatim OS copyright evidence and CPython license below |

The release DEB itself was downloaded from the Draft and re-hashed. No package contents or application code were changed for this reconciliation.

## Dependency placement

### Bundled in the DEB

These live below `/opt/VISTA Lab Station`; their licenses/notices must travel with the application. Package-level component names and versions below are taken from the binary SBOM; license evidence is the packaged `.dist-info` metadata and/or license files collected in `ubuntu-x64-THIRD_PARTY_LICENSES.zip`.

| Component | Version | License evidence/status |
| --- | --- | --- |
| MuJoCo | 3.17.0 | Binary SBOM `Apache-2.0`; packaged `LICENSE` and `LICENSES_THIRD_PARTY.md` |
| NumPy | 2.4.6 | Binary SBOM expression `BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0`; package license texts included |
| Paho MQTT | 2.2.0 | Binary SBOM `EPL-2.0 OR BSD-3-Clause`; package license text included |
| pySerial | 3.5 | Binary SBOM names `BSD`; packaged metadata and license text included |
| vendored `importlib_metadata` | 8.0.0 | Binary SBOM `Apache-2.0`; vendored metadata/license included |
| vendored `wheel` | 0.45.1 | Binary SBOM `MIT`; vendored metadata/license included |
| CPython runtime | 3.11.18 | Binary SBOM is `NOASSERTION`. Exact upstream `v3.11.18/LICENSE` is included in the archive; it contains PSF and other bundled component terms. No single SPDX license is substituted for that multi-part notice. |
| Electron / Chromium | versions are in packaged runtime metadata | Existing archive contains Electron and Chromium notices (`LICENSE.electron.txt`, `LICENSES.chromium.html`). Chromium's bundled license inventory is retained as upstream text, not reduced to one inferred identifier. |
| PyInstaller / bootloader | build/runtime tool; version appears in runtime inventory | Existing archive includes the PyInstaller license and its special exception allowing distribution of programs built with PyInstaller. |

The binary SBOM also reports these bundled Ubuntu-origin native package components without a license assertion. Their matching files in the DEB include (or resolve to) the named shared libraries. The release archive now includes the corresponding verbatim Ubuntu 26.04 `/usr/share/doc/<package>/copyright` records. The package versions match the binary SBOM and the CI runner image version recorded above.

| Binary SBOM component | Version | Bundled files / mapping | Evidence attached in license archive |
| --- | --- | --- | --- |
| bzip2 | 1.0.8-6ubuntu0.1 | `libbz2.so.1.0` | `ubuntu-runner-copyright/bzip2.copyright` |
| gcc-16 | 16-20260322-1ubuntu1 | `libgcc_s.so.1`, `libstdc++.so.6` | `libgcc-s1.copyright`, `libstdc++6.copyright` |
| libffi | 3.5.2-4 | `libffi.so.8` | `libffi8.copyright` |
| libzstd | 1.5.7+dfsg-3 | `libzstd.so.1` | `libzstd1.copyright` |
| ncurses | 6.6+20251231-1 | `libtinfo.so.6` | `libtinfo6.copyright` and `libncurses6.copyright` |
| openssl | 3.5.5-1ubuntu3.7 | `libcrypto.so.3`, `libssl.so.3` | `openssl.copyright`, `libssl3t64.copyright` (same Ubuntu copyright record) |
| readline | 8.3-4 | `libreadline.so.8` | `libreadline8t64.copyright` |
| util-linux | 2.41.3-3ubuntu2.2 | `libuuid.so.1` | `util-linux.copyright` |
| xz-utils | 5.8.3-1ubuntu0.1 | `liblzma.so.5` | `xz-utils.copyright` |
| zlib | 1:1.3.dfsg+really1.3.1-1ubuntu3.2 | `libz.so.1` and Python `zlib` extension | `zlib1g.copyright` |
| python | 3.11.18 | `libpython3.11.so.1.0` and frozen CPython runtime | `python-3.11.18-LICENSE.txt`, fetched from the official CPython `v3.11.18` source tag |

The copyright files are verbatim Ubuntu package records, not synthesized SPDX grants. Their exact file hashes are recorded alongside them in the archive's `ubuntu-runner-copyright/SHA256SUMS`. Repeated copyright texts (for example GCC runtime and libstdc++) remain separately named for traceability.

### Provided by the host system / APT

The DEB control metadata declares the following `Depends`. They are not bundled inside the DEB; APT installs/resolves them from the target Ubuntu/Debian system, which retains the applicable notices in its package database and `/usr/share/doc`.

`libgtk-3-0`, `libnotify4`, `libnss3`, `libxss1`, `libxtst6`, `xdg-utils`, `libatspi2.0-0`, `libuuid1`, `libsecret-1-0`.

`libuuid1` is a declared host dependency even though the Edge runtime separately bundles `libuuid.so.1`; these are distinct placements. Likewise, APT dependencies are not interchangeable with the bundled native libraries listed above.

## SBOM `NOASSERTION` treatment and closure

- For the versioned Ubuntu-origin binary SBOM components in the bundled-native table, `NOASSERTION` was not replaced by a guessed SPDX ID. The final archive now carries the corresponding exact-version Ubuntu copyright records as primary notice evidence.
- For CPython 3.11.18, the binary SBOM's `NOASSERTION` is accompanied by the exact upstream release's multi-part `LICENSE` text. It remains represented as upstream text; no single license identifier is inferred.
- The first-party `vista-lab-station@0.1.0` binary SBOM entry has no license assertion. It is project code, not third-party software; this reconciliation does not assign a project license. Owner-provided authorization for copied checkIk files remains recorded in `THIRD_PARTY_NOTICES.md`.
- Binary SBOM file-level records without purl/version are file observations (including the DEB and shared-library paths); they are not independent package identity or license evidence. They are associated with the versioned package components only where path/name and package evidence support that mapping.
- Runtime Python SBOM `NOASSERTION` entries are from the build environment inventory and are not proof that each package is shipped as an independent runtime distribution. Where a component is actually bundled, its notice is in the existing license archive or is covered by the Ubuntu/CPython additions above. Do not treat the 18-component environment inventory as a complete runtime dependency closure.
- Source-input SBOM (583 components, zero dependency edges) is a source/build-input inventory. It is not a substitute for the final binary SBOM.

The final package tree was checked against the runtime inventory's expected distribution directories. The actual frozen runtime contains `mujoco`, `numpy`, `paho`, `serial`, `setuptools`, plus vendored `importlib_metadata` and `wheel`; their respective distribution license evidence is in the archive. The following names occur in the build-environment SBOM but do not occur as package distributions in the final DEB tree: `packaging`, `zipp`, `glfw`, `pyinstaller`, `websockets`, `typing_extensions`, `altgraph`, `pyinstaller-hooks-contrib`, `fsspec`, `absl-py`, `pip`, `etils`, and `PyOpenGL`. The PyInstaller bootloader is a separate bundled build output and its upstream license plus special exception is included. The Python inventory's `NOASSERTION` for NumPy, MuJoCo, and Paho does not supersede their final binary SBOM license expressions; their packaged license files are included. `PyOpenGL` has no license text in the archive, but the final DEB tree inspection found no PyOpenGL distribution or files, so it is a build-inventory item rather than a shipped dependency of this artifact.

The release's third-party notice inventory and license archive are now reconciled to the SBOM at the evidence level available from the package tree, build runner and packaged metadata. License identifiers remain `NOASSERTION` in SBOM records where the SBOM generator supplied none; the attached verbatim license/copyright evidence does not rewrite the SBOM's assertions.

## Remaining acceptance gates

- Owner installation/launcher/icon/Simulation Profile/uninstall acceptance on this exact DEB hash is still pending. Static package inspection does not claim desktop-session acceptance.
- Draft v0.1.0 remains unpublished. After replacing its notices, reconciliation, license archive and checksum assets, all ten SHA256SUMS entries were verified against a fresh Draft download and the license ZIP passed its integrity check. The DEB hash remained unchanged. No new DEB build is needed for document-only changes.

## Evidence sources

- Native CI job log for run 45628473427, which records Ubuntu 26.04.1 and the runner image.
- Ubuntu package copyright records for the exact versions identified in the binary SBOM, copied verbatim from the matching Ubuntu 26.04 package documentation.
- CPython official source tag `https://raw.githubusercontent.com/python/cpython/v3.11.18/LICENSE`.
- Final DEB package control data, package file tree, binary/runtime/source CycloneDX SBOMs, and attached license archive.
