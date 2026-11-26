# VISTA Lab Station — English User Guide

This guide describes the Ubuntu amd64 v0.1.0 release. The owner reports that its approved release process is complete. Public access and the final published asset checksum were not independently verified from this workspace; compare the downloaded file against the checksum shown with the official release before installing. The current application interface is partly Vietnamese and partly English; this guide does not imply a complete English UI locale.

## 1. Download, verify, install, launch, and remove

Official release page (owner-designated): <https://github.com/leduc121/vista_lab/releases/tag/v0.1.0>

Ubuntu amd64 DEB: <https://github.com/leduc121/vista_lab/releases/download/v0.1.0/VISTA.Lab.Station-0.1.0-amd64.deb>

Download to a temporary path and calculate its SHA-256:

```sh
curl -fL "https://github.com/leduc121/vista_lab/releases/download/v0.1.0/VISTA.Lab.Station-0.1.0-amd64.deb" -o /tmp/vista-lab-station.deb
sha256sum /tmp/vista-lab-station.deb
```

Compare the displayed digest against the exact DEB entry in the official v0.1.0 release's `SHA256SUMS` before proceeding. Stop if the asset or checksum is unavailable or different. Historical local candidate hashes describe different files and are not a substitute for the published hash.

Install only after checksum verification; APT resolves the package's declared system dependencies:

```sh
sudo apt install /tmp/vista-lab-station.deb
```

The package targets Ubuntu amd64. The locally recorded build host was Ubuntu 26.04.1; the exact Ubuntu release used for the owner's final install acceptance is not present in this workspace record.

Launch **VISTA Lab Station** from the Education menu, or run:

```sh
vista-lab-station
```

To reinstall the same candidate, remove and install again:

```sh
sudo apt remove vista-lab-station
sudo apt install /tmp/vista-lab-station.deb
```

To uninstall:

```sh
sudo apt purge vista-lab-station
```

The package removal keeps the per-user application data directory. Remove local student data from the app or OS user account only under the lab's retention policy.

## 2. Sign in and open an assigned lab

Use the student account provided by the course administrator. Sign-in and assigned lab access require the configured Education API and network. Demo mode is an explicitly labeled local fixture; it does not authorize a student, load a real assignment, or save a result to the platform.

Open **My Labs**, select the assigned lab, review its details and preflight status, then choose **Mở Blockly & Simulation** (the current UI label) to open the existing Blockly workspace. Save, submit, and server results depend on the live Education API. Do not treat Demo fixture status as a real submission.

## 3. Simulation Profile — available in the package

The **Simulation (Python 3.11)** profile uses the bundled Edge executable, MuJoCo engine, and SO-101 model. It does not require a source checkout, Conda, a developer toolchain, physical hardware, or an AI model download. A GPU is not required. Keep hardware output disabled.

In the Blockly workspace, inspect the assigned program and choose its local simulation action. MuJoCo executes the simulation and reports local state/telemetry. The profile is labeled simulation; it does not move a physical robot or prove that an Education API experiment was saved. Use joint controls for predictable simulation. Cartesian `checkIk` control is experimental and simulation-only because the current model frames have a measured end-effector offset.

The packaged candidate was exercised from an extracted DEB payload on Ubuntu 26.04.1 with the real bundled MuJoCo runtime. This verifies packaged simulation behavior, but not a clean-machine package installation.

## 4. Robotics Profile — optional, operator-managed

The Robotics (Python 3.12) profile is **not standalone**. It requires all of the following, supplied and managed by an authorized lab operator:

- A compatible Python 3.12.14 environment and the dependencies in the approved Edge runtime lockfile, including LeRobot, Torch, MuJoCo, and serial support.
- An authorized VISTA Edge source checkout containing `edge/runtime.py`.
- For hardware discovery or control, supported and connected hardware, correct OS serial permissions, matching device/role configuration, approved calibration, commissioning, and an authorized operator. Physical motion remains unaccepted and disabled in this release candidate.

The application does not install dependencies or download models. On a lab-managed development machine, prepare the environment from the approved Edge source checkout using the repository's locked runtime definition; for example:

```sh
uv python install 3.12.14
uv sync --locked --project edge/robot-runtime --python 3.12.14
uv pip check --python edge/robot-runtime/.venv/bin/python
```

These commands require `uv` and the authorized source checkout. They are operator setup, not student prerequisites for Simulation. In Settings, select the environment's Python executable and the Edge checkout directory. Check the displayed profile readiness and Diagnostics. A missing environment, dependency, source tree, port, or driver must remain reported as blocked/action required; it is not evidence of a connected robot. Selecting Robotics does not connect, calibrate, or arm hardware.

Do not run calibration or connect a physical serial device unless the lab owner has completed the hardware commissioning checklist and explicitly authorized the session. Calibration can write motor configuration. Keep the robot's hardware emergency stop accessible during separately approved commissioning.

## 5. Recording, replay, and evidence

The application has a **Recordings & Evidence** area for local recording artifacts and their metadata. Recording can be inspected and replayed where a compatible artifact is available. The supported local format is `vista.robot.recording.v1`; preserve the generated manifest and trajectory together. Replay is visualization only and must never actuate a robot.

The current local Blockly MuJoCo run is not wired into a command-bound recording/evidence upload flow. Desktop does not currently upload this recording format to an Education API submission. A local file or Demo status is not an Uploaded, Verified, or teacher-reviewed result. Use only the platform's approved evidence workflow when it is provided for the assigned exercise; never add credentials or student tokens to an artifact.

## 6. Safe shutdown

Stop the active run or recording, wait for the runtime to report stopped, then close the application normally. If the safety stop is latched, it requires an explicit reset; reset does not re-arm motion. On a Robotics session, disconnect using the app's supported device flow before closing. Do not unplug a powered robot as a substitute for stopping it.

## 7. Troubleshooting

| Symptom | What to check |
| --- | --- |
| App does not start | Confirm amd64 Ubuntu, install the package with APT so dependencies are resolved, and launch from a terminal to capture sanitized errors. |
| Simulation runtime is blocked | Open Settings/Diagnostics and confirm the Simulation profile and bundled MuJoCo/model health. Reinstall the verified package if files are missing; do not install Conda or source dependencies to repair Simulation. |
| Sign-in or assigned lab unavailable | Check network and administrator-provided Education API configuration/account. Demo mode is not a substitute for authorization. |
| Robotics profile is blocked | Confirm the operator-selected Python 3.12 environment, locked dependencies, authorized Edge source path, and runtime diagnostics. Do not download dependencies through the app. |
| No serial device or calibration state | Check only under operator direction. Verify OS permissions, selected role/port, approved configuration, and driver-reported calibration. No device or calibration state is inferred from simulation. |
| Recording cannot be submitted | Local recording upload is not accepted by this Desktop integration. Preserve the local artifact and use the course's approved workflow or contact the administrator. |
| Safety stop is active | Stop the exercise, determine the cause, then use explicit reset if authorized. A reset leaves motion unarmed. |

Share only sanitized diagnostics and the application version with support. Never share passwords, access tokens, certificates, private keys, or unredacted student identifiers.

## 8. Capability status

- **Available:** packaged Simulation Profile with local MuJoCo and bundled SO-101 model.
- **Optional/operator-managed:** Robotics Profile environment detection and mock/fake workflows.
- **Hardware-dependent and not commissioned:** physical connection, calibration, and motion.
- **Not accepted as Desktop cloud integration:** AWS MQTT dispatch, authenticated cloud Twin execution, and Desktop recording upload/submission association.
- **Not required for Simulation:** Conda, source checkout, GPU/CUDA, or large AI model downloads.
- **Distribution scope:** Ubuntu amd64 DEB only. Windows and macOS are Coming Soon; AppImage is not part of v0.1.0.

## 9. Product description and external services

VISTA Lab Station is a desktop client for assigned robotics labs, with Blockly programming and local SO-101 MuJoCo simulation. The optional Robotics Profile requires an operator-managed Python/LeRobot environment. Physical robot operation and cloud evidence require separate authorization and acceptance. The Education API and Digital Twin endpoints are operator-configured; the application does not contain credentials. Local Demo and mock tests are not cloud acceptance.

For Web/AWS runtime, recording, and instructor-review requirements, use the [Education Platform Integration Handoff](FINAL_EDUCATION_PLATFORM_INTEGRATION_HANDOFF_2026-11-25.md). For exact final public checksum, compare the installed download against the actual `v0.1.0` release `SHA256SUMS` entry; do not use historical workspace candidate hashes.
