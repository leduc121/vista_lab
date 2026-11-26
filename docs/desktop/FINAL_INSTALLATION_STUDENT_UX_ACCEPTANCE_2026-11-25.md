# VISTA Lab Station — Final Installation and Student UX Acceptance

**Date:** 2026-11-25  
**Candidate:** `dist/phase6-candidate/VISTA Lab Station-0.1.0-amd64.deb`  
**SHA-256:** `8eb5d74c23a3be4d2164f7e58bbbb0938467240cead40eabc328e846a29309b4`  
**Scope:** Ubuntu amd64 package metadata, extracted payload, previously captured packaged Electron/MuJoCo evidence, and student-facing guide. No privileged package installation, AWS access, physical hardware, merge, or publication.

## Decision

**Simulation-only local candidate: PASS with installation limits.** The package metadata and payload are valid for amd64; it includes the Electron app, desktop entry, icon, bundled Edge runtime, MuJoCo model, and dependencies. Existing acceptance evidence confirms the corrected candidate's extracted-payload Electron and local MuJoCo workflow. The simulation can be used without source checkout, Conda, development toolchain, physical hardware, GPU, or large model download.

**Clean installation and system integration: BLOCKED / NOT RUN.** Docker exists but its daemon is inaccessible in this workspace; no debootstrap environment is available. The attempted extracted-package Electron smoke was blocked because the sandbox denied binding a local loopback port (`EPERM`). Prior packaged Electron/MuJoCo evidence is retained from [Final Robotics Lab Acceptance](ROBOTICS_LAB_FINAL_ACCEPTANCE_2026-11-25.md). No `sudo apt install`, owner-host installation, system menu launch, uninstall, or reinstall was performed.

**The corrected candidate is not the GitHub Draft DEB.** The Draft DEB has a different hash and retains a simulation gripper-limit defect. Only the local candidate hash above has the fix. No public download URL is approved.

## Package verification

| Check | Result | Evidence / boundary |
| --- | --- | --- |
| Package metadata | **PASS** | `dpkg-deb -I`: `vista-lab-station`, `0.1.0`, `amd64`; installed size 484,201 KiB. |
| Architecture and integrity | **PASS** | Current candidate SHA-256 matches the Robotics acceptance report; DEB archive inspected and extracted to `/tmp/vista-install-acceptance-root`. |
| Declared dependencies | **PASS — DECLARATIONS PRESENT** | GTK 3, libnotify, NSS, Xss, Xtst, xdg-utils, atspi, uuid, libsecret; optional AppIndicator. Actual APT resolution/install is **NOT RUN**. |
| Desktop entry | **PASS — STATIC VALIDATION** | `usr/share/applications/vista-lab-station.desktop` passed `desktop-file-validate`; launches `/opt/VISTA Lab Station/vista-lab-station`, category Education. Menu database registration is **NOT RUN**. |
| Icon | **PASS — FILE PRESENT** | Hicolor `512x512/apps/vista-lab-station.png` is present. Desktop menu appearance was not observed in a desktop session. |
| Application launch and shutdown | **PASS — PRIOR PACKAGED SMOKE** | Existing report exercised the corrected packaged Electron candidate and safe MuJoCo runtime shutdown under Xvfb. The new replay attempt was sandbox-blocked before launch. |
| Install, uninstall, reinstall | **BLOCKED / NOT RUN** | No isolated Ubuntu image or package-root test without executing privileged absolute-path maintainer scripts was available. No installation was run on the owner's host. |
| Binary dependencies | **PARTIAL** | `ldd` found no unresolved libraries on the current Ubuntu 26.04.1 host. Host `LD_LIBRARY_PATH` resolves Wayland libraries from the owner's Hyprland directory, so this is not clean-image evidence. |

### Ubuntu compatibility

The target is Ubuntu amd64. Actual evidence is limited to an Ubuntu 26.04.1 build runner and this Ubuntu 26.04.1 workspace host. The package was not installed on a clean system. No other Ubuntu release is claimed as supported or tested by this acceptance. The package's APT dependency declaration is the source for system requirements; do not infer a minimum Ubuntu version from the architecture field alone.

## Student workflow and profiles

| Capability | Result | User-facing limit |
| --- | --- | --- |
| Download and installation instructions | **DOCUMENTED** | [English User Guide](USER_GUIDE_EN.md) includes internal candidate checksum, APT install, launch, reinstall and remove. It explicitly says no public download is available. |
| Simulation Profile | **PASS — PACKAGED RUNTIME** | Local MuJoCo SO-101, state, result and safe shutdown verified in prior candidate evidence. Demo mode is a fixture; no real Education API experiment is claimed. |
| Robotics Profile setup | **DOCUMENTED — OPTIONAL / EXTERNAL** | Requires operator-managed Python 3.12.14, locked LeRobot/Torch/MuJoCo/serial dependencies and an authorized Edge checkout. App does not download/install these. Hardware adds supported devices, calibration and commissioning. |
| Student assignment flow | **PARTIAL** | Existing workspace flow was tested with Demo fixture; a real assignment needs the Education API. UI currently uses mixed Vietnamese and English labels; this is recorded so English guide terminology is not mistaken for an English UI locale. |
| Loading/error status | **PASS — EXISTING STATUS FIELDS** | Runtime profile status and Diagnostics expose readiness/errors; Robotics screens distinguish missing runtime/device/calibration. Physical output remains disabled. |
| Recording and replay | **PARTIAL** | Existing Recordings & Evidence and `vista.robot.recording.v1` artifacts are documented. Local Blockly MuJoCo telemetry is not wired to command-bound recording/upload; replay is visualization only. |
| Evidence access | **BLOCKED FOR DESKTOP CLOUD SUBMISSION** | Local files are not an Education API submission or teacher-verified result; see the Education Platform integration handoff. |
| Physical controls | **SAFE — DISABLED** | No physical commissioning or movement accepted. UI and code retain motion lock; do not infer readiness from a connection indicator. |

The guide reuses the previously captured actual screenshots in `evidence/`; no screenshot was fabricated or recaptured in this turn. Those images are prior packaged UI evidence, not proof of clean install or menu integration.

## Release-candidate gate

- Keep the current corrected DEB bytes unchanged for this documentation-only update.
- The older Draft DEB is not an acceptable student Simulation candidate because it has the known simulated joint-limit defect.
- The corrected local candidate is not published; a release owner must review the exact hash and replace the Draft asset before any distribution.
- No Windows, macOS, or AppImage build was created.
- No clean-image install could be run with available isolated tooling. This is an acceptance gap, not evidence that APT installation fails.

## Evidence commands

Package checks used:

```sh
dpkg-deb -I 'dist/phase6-candidate/VISTA Lab Station-0.1.0-amd64.deb'
dpkg-deb --extract 'dist/phase6-candidate/VISTA Lab Station-0.1.0-amd64.deb' /tmp/vista-install-acceptance-root
desktop-file-validate /tmp/vista-install-acceptance-root/usr/share/applications/vista-lab-station.desktop
sha256sum 'dist/phase6-candidate/VISTA Lab Station-0.1.0-amd64.deb'
```

The subsequent `xvfb-run node scripts/electron-smoke.cjs` attempt exited before app launch with loopback `listen EPERM`; no new launch evidence is claimed. Existing packaged Simulation evidence is in the linked Robotics Lab report.
