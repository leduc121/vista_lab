# VISTA Lab Station — Capstone Demo Procedure

## Before the session

1. Launch the internal candidate in Demo mode; verify the dashboard says SIMULATION and `hardwareEnabled=false`.
2. In Diagnostics, verify the Edge Runtime and MuJoCo are available and the safety state is not ESTOPPED or FAULT.
3. In Settings, show the active Simulation Profile. If demonstrating the optional Robotics Profile, choose the prepared Python 3.12.14 environment and authorized Edge source checkout, switch profiles with all arms disconnected, and verify the UI says READY, `fakeRobot=true`, `hardwareEnabled=false`. Do not connect hardware during the software demo.
4. Keep robot arms disconnected. Leave `VISTA_IOT_ENABLED` unset and do not provision production certificates.
5. Use a disposable local user profile and test experiment identifiers. Do not use student production records.

## Demo sequence

1. Navigate Dashboard → Devices → Teleoperation and show both isolated fake pairs.
2. Move a leader input in the simulation, release deadman, and show the output stops. Demonstrate that a conflicting source is rejected.
3. Show the Cartesian workspace marked Experimental simulation only. If used, select a known target and show the measured frame-error/rejection. Do not describe it as calibrated Cartesian control.
4. Run one allowlisted Blockly program in MuJoCo and show the measured telemetry source is SIMULATION.
5. Start and stop a local episode. Show its episode ID, `vista.robot.recording.v1` manifest, frame count and SHA-256.
6. Run the local WF03 acceptance test. Show accepted → executing → completed, telemetry, local recording, and mock evidence result PROCESSING. State that this is LOCAL CONTRACT PASS only.
7. Show the MQTT runtime reports disconnected/disabled and the physical safety state remains locked.
8. Exit and relaunch to demonstrate clean runtime shutdown and recovery of local recordings.

## Stop conditions

Stop the demo if the UI reports physical readiness, hardware enabled, an unexpected serial device, a nonlocal MQTT connection, or evidence status other than the mock result. Do not connect a physical arm or Production AWS identity during the demo.
