# VISTA Final Acceptance Evidence — 2026-11-25

This is an internal software acceptance record. It does not certify physical hardware, AWS production, or WF01–WF04 system acceptance.

## Software results

| Area | Result | Evidence |
| --- | --- | --- |
| Robotics Profile | **PASS — LOCAL VERIFIED** | Python 3.12.14, Torch 2.7.1+cpu (`cuda=None`, unavailable), LeRobot 0.6.1, NumPy 2.2.6, MuJoCo 3.17.0. Leader/follower classes imported and initialized disconnected. Packaged supervisor reported `READY`, `lerobot=true`, `mujoco=true`, and shut down. |
| Safety defaults | **PASS — SIMULATION ONLY** | `fakeRobot=true`, `hardwareEnabled=false`; selecting the Robotics Profile did not connect or arm a robot. |
| Desktop UI | **PASS — LOCAL VERIFIED** | Native Electron smoke completed Demo login, assignment, Blockly save/version/run, then verified profile controls and disabled hardware state. |
| AppImage | **PASS — BUILD + STARTUP VERIFIED** | Packaged AppImage completed the UI workflow with Simulation and Robotics profiles. |
| Debian package | **PASS — ARCHIVE + STARTUP VERIFIED** | DEB metadata/contents checked, extracted in `/tmp`, packaged executable completed the UI workflow in Simulation. It was not installed system-wide. |
| Windows/macOS | **NOT RUN** | Workflow matrix defines Windows x64 NSIS and macOS arm64 DMG jobs; no native CI run or platform acceptance occurred in this task. |
| Final regression | **PASS** | Python Edge suite: 87 passed. `npm test`: 25 API contract checks and 18 Node tests passed. Renderer build/typecheck, supervisor target tests and `git diff --check` passed. |

Packaged screenshots:

- [Robotics Profile Settings](evidence/robotics-profile-packaged.png)
- [Blockly Demo Workspace](evidence/workspace-packaged.png)

The DEB candidate was assembled from electron-builder's Linux unpacked output and the RC DEB's control metadata after fpm stalled. `dpkg-deb --info`, archive listing, extraction, and executable startup passed. It was not installed through apt.

## Candidate artifacts

New internal Linux x64 candidate (`dist/vista-capstone-final-rc/`):

- AppImage SHA-256: `be8c1d835c7621db86e9c29b8f9cc50665ad5ab7ca17da3000a4bc09991bb29b`
- DEB SHA-256: `a76a90a1f07dfef8f9e33008df875eefc809bffafbd24f5a88ae7a951d66954b`

The accepted RC 0.1.0 artifacts in `dist/phase6-candidate/` remain unchanged; checksums are recorded in [RC handoff](RC_HANDOFF_0.1.0.md).

## Acceptance gates still blocked

| Acceptance | Result | Blocker |
| --- | --- | --- |
| Physical Robot Acceptance | **BLOCKED / NOT RUN** | No owner approval for physical writes or motion; no verified four-arm setup, hardware limits, physical E-stop, calibration, stop strategy, or authorization. No serial device was opened. |
| AWS E2E | **BLOCKED / NOT RUN** | Official current `se/develop` handoff, isolated test student/experiment identity, and externally provisioned device certificate were not supplied. No AWS connection, dispatch, or resource change occurred. |
| WF01 | **BLOCKED** | Requires the Web team’s test school/classroom and allocation evidence. |
| WF02 | **BLOCKED** | Requires the Web team’s assignment/student submission scope. |
| WF03 | **LOCAL CONTRACT PASS only** | Local mock authorized experiment → MQTT test transport → Edge Runtime → safety gate → fake/MuJoCo execution → lifecycle → telemetry → recording/manifest → mock upload/result contract passes in the local integration suite. This is not server result persistence or system acceptance. |
| WF04 | **BLOCKED** | Requires persisted evidence and authenticated instructor review/grading in the Web platform. |

No message was sent to Claude Code or Web team; external coordination needs an available authorized channel. AWS/backend acceptance remains separate from this local software result.

## Release handoff gates

- `checkIk`-derived source/assets still have no confirmed redistribution license/ownership. Do not push or publicly distribute source or installers until the owner confirms rights.
- `gh auth status` reports the configured GitHub token as invalid. The release branch and PR were not created or pushed.
- No AWS or physical hardware acceptance is certified. The merge decision is **NO-GO** until project-owner gates above are cleared.
