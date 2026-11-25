# VISTA Lab Station 0.1.0 release checklist

Status: **not ready to publish**. This checklist is limited to Desktop distribution blockers. Merge target: `80aef01eca657fa8a2dbe3340bac27e048619b11`. No rebuild, functionality change, safety change, or WF03 contract change is authorized or needed at this stage.

## Resolved

- [x] Owner confirmed ownership of checkIk source and authorized integration, modification, packaging, and redistribution as part of VISTA Lab Station; no additional attribution/notice is required for original checkIk code. No SPDX license is assigned.
- [x] Reused checkIk provenance and the five packaged files are documented with SHA-256 values in `THIRD_PARTY_NOTICES.md` and `DESKTOP_DISTRIBUTION_SBOM.cdx.json`. The remaining ignored checkIk checkout is not included.
- [x] Source-input CycloneDX SBOM prepared for npm lock packages, direct Desktop Python dependencies, optional Robotics lock packages, model assets, and five reused checkIk files. Entries with no confirmed license use `NOASSERTION`; this is not a grant or license inference.
- [x] Third-party notices prepared, including npm inventory, relevant bundled notices, Python license text, MuJoCo 3.17.0 license and third-party notices.
- [x] Existing Linux launch/install instructions and platform artifact procedure remain documented in `DESKTOP_DISTRIBUTION_HANDOFF.md`; no public URL is fabricated.

## Pending before a public release

- [ ] In GitHub Web, identify a successful native workflow run with full head SHA exactly `80aef01eca657fa8a2dbe3340bac27e048619b11`. Use Windows x64 NSIS and Linux x64 DEB + AppImage artifacts from that same run only. Stop if the SHA, run status, job results, or artifacts do not match.
- [ ] Inspect each downloaded archive and artifact; verify platform/architecture, filename, and package contents. Confirm native PyInstaller dependency closure per artifact. Do not mix artifacts across runs.
- [ ] Reconcile the source-input SBOM with final artifact contents. Add resolved transitive Python components and their license evidence to the per-release SBOM. Preserve `NOASSERTION` where license remains unverified.
- [ ] Confirm required third-party notice texts are available with the final artifact set, including Electron/Chromium notices from each build and applicable Python transitive notices.
- [ ] On target Ubuntu, install the exact DEB, verify desktop entry/icon and launcher startup, then uninstall. Launch the exact AppImage and verify exit/removal behavior. Record evidence.
- [ ] Confirm Simulation Profile from the exact installer. Robotics remains an optional external Python 3.12 environment plus authorized Edge source checkout; do not install dependencies into system Python or download models/CUDA.
- [ ] Generate `SHA256SUMS` from only the three verified assets in a clean directory; validate locally, upload to a draft release, fetch back, and compare hashes. Record exact filenames, hashes, and URLs in handoff.
- [ ] Check whether `v0.1.0` tag already exists and verify its target. Create a draft Release targeting the exact merge SHA with final release notes and only the verified assets/notices/SBOM/checksums. Do not publish without explicit owner approval.

## Manual GitHub Web steps

1. Open `leduc121/vista_lab` → **Actions** → **Native desktop acceptance**. Open a completed successful run and compare its full commit SHA character-for-character with `80aef01eca657fa8a2dbe3340bac27e048619b11`. Confirm Linux and Windows jobs passed. If no run matches or artifacts expired, stop; do not rebuild under this handoff.
2. Download `vista-lab-station-windows-latest` and `vista-lab-station-ubuntu-latest` from that one run. Extract separately. Select exactly one Windows x64 `.exe`, one Linux amd64 `.deb`, and one Linux x86_64 `.AppImage`. Never use local `dist/`, `releases/v0.1.0/`, or another run as a substitute.
3. Inspect archive members and confirm each package architecture and expected filename. Install/test the Linux packages. Calculate hashes in a clean staging folder:

   ```sh
   sha256sum -- *.exe *.deb *.AppImage > SHA256SUMS
   sha256sum -c SHA256SUMS
   ```

4. Reconcile SBOM/notices to the actual artifacts and add final checksums and exact names. If a CI artifact or transitive dependency cannot be identified, stop before creating a public-facing release.
5. Open **Releases** → **Draft a new release**. If tag `v0.1.0` exists, verify it points to the exact merge commit; never move an existing public tag. Otherwise create the tag from the exact merge commit. Attach only the verified assets, `SHA256SUMS`, SBOM, notices, and final release notes; save as draft. Do not click **Publish release** without explicit approval.
6. After owner approval/publication, download each asset from the Release page and verify SHA-256 again. Only then replace pending URLs and hashes in the website handoff.

## Explicitly out of scope

- macOS artifacts unless independently available and verified against the same merge SHA; Intel macOS has no verified artifact.
- Rebuilds, source changes, feature work, AWS changes, and direct edits to `main`.
