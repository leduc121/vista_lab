# VISTA Lab Station — User Guide

## 1. Install and launch

Use the versioned installer produced for your operating system. Linux candidates are an AppImage and a Debian package; Windows uses the NSIS installer; macOS uses a DMG when its native build is available. The current candidate is unsigned and is for internal review only. Do not distribute it publicly until the ownership and asset-provenance review is complete.

On Linux, serial access may require membership in the `dialout` group or the distribution's `uaccess` rule. Sign out and back in after changing group membership. The application reports serial permission and runtime errors in Diagnostics.

## 2. First run and sign-in

Use the student account issued by the course administrator. VISTA keeps the session in the operating system's secure storage when available. If sign-in or token refresh fails, check the configured Education API environment and network connection; do not paste tokens into logs or support messages.

Demo mode is an offline UI fixture. It does not establish API authorization, robot entitlement, physical connection, or evidence persistence.

## 3. Runtime and safety

The default runtime is local simulation with `fakeRobot=true` and `hardwareEnabled=false`. Dashboard state reflects runtime evidence and does not infer physical readiness from a cloud or MQTT connection.

Settings offers Simulation (the bundled Python 3.11 profile) and an optional Robotics profile. For Robotics, select a Python 3.12.14 environment recreated from `edge/robot-runtime/pyproject.toml` and `uv.lock`, then select an authorized VISTA source checkout containing `edge/runtime.py`. The app validates CPU-only Torch and LeRobot imports, shuts the current runtime down before starting the selected profile, and refuses a profile switch while an arm is connected or executing. The package does not bundle the source checkout because checkIk-derived redistribution rights are unresolved. Selecting Robotics does not connect or arm hardware; hardware authorization remains disabled.

Use the Emergency Stop control to latch the local safety controller. Reset requires explicit confirmation and does not arm motion. Physical control remains unavailable until device identity, calibration, limits, hardware stop strategy, and operator authorization have each been verified. Keep the robot's physical emergency-stop circuit accessible during any separately approved hardware acceptance.

## 4. Simulation workspace

Open the assigned lab workspace, review the program, and choose the simulation run action. MuJoCo runs locally. The Digital Twin and telemetry views display the source mode and freshness of available state.

Cartesian checkIk IK is labeled **Experimental simulation only**. Its URDF and MuJoCo gripper-frame models have a measured systematic offset close to the 20 mm rejection threshold. Prefer manual joint controls for a predictable simulation workflow until model frames are reconciled.

## 5. Robot devices and calibration

The device page can discover serial ports and assign Leader A, Follower A, Leader B, or Follower B. A serial port can belong to one arm only. Firmware and identity fields are shown only when the runtime supplies them.

Calibration is an operator-guided hardware procedure that can write motor registers. In this release candidate, hardware is disabled by default; do not attempt physical calibration or motion unless the project owner has approved the hardware checklist and the app reports all safety prerequisites as verified.

## 6. Teleoperation

The normal teleoperation panel exercises isolated fake/simulation pairs. Each pair has its own safety ownership; loss of deadman, stale commands, or disconnect stops the pair. Physical Leader-to-Follower execution is implemented behind the same safety gate but remains fail-closed pending hardware commissioning.

## 7. Recording and evidence

Recordings are written under the application's user-data directory. Stop a recording before replay or upload. The manifest uses `vista.robot.recording.v1`; the trajectory SHA-256 is shown in the episode library. Local Recorded, Uploading, Uploaded, Processing, Verified, and Failed describe different states; only an Education API evidence response can establish Uploaded or Verified status.

The local WF03 acceptance uses a mock evidence endpoint and is not production evidence. AWS upload requires the signed-in student, an authorized experiment, and the contract-provided presigned upload fields. Never add AWS credentials or certificate contents to a recording or support log.

## 8. Cloud connection

AWS IoT uses MQTT over mutual TLS on port 8883. Select externally provisioned CA, device certificate, and private-key files through the credential picker. The runtime stores references, validates the private-key permissions, subscribes to the configured command topic, and reports MQTT state separately from robot readiness. Production dispatch stays disabled unless the project owner explicitly enables it in an approved test window.

## 9. Diagnostics and support

Open Diagnostics for runtime health, MuJoCo availability, device ports, calibration state, safety state, MQTT state, and recent errors. Share sanitized error text and app version only. Never share passwords, tokens, certificates, private keys, or unredacted student identifiers.

## 10. Known limitations

- Physical hardware, calibration, and stop behavior have not been accepted on a robot.
- The optional Robotics Profile requires an operator-provided Python 3.12 environment and authorized Edge source checkout; it is not self-contained in the installers.
- AWS mutual-TLS, production command dispatch, workers, and scoped live Twin are not verified.
- Local WF03 is a mock contract acceptance, not server result/evidence persistence.
- Cartesian IK remains experimental because of the URDF/MuJoCo end-effector offset.
- Windows/macOS packaging can build in native CI, but platform installation/runtime acceptance must be performed on those operating systems.
- checkIk source ownership and redistribution rights remain to be confirmed; the internal candidate must not be publicly distributed.
