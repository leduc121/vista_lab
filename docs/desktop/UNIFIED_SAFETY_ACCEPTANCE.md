# Unified Safety Controller — Phase acceptance

## Protected execution paths

| Source | Runtime path | Gate before sink | Current mode |
| --- | --- | --- | --- |
| Manual / leader–follower, pair A and B | `teleop_step` → `PairTeleoperation.step` | Per-follower lease, named six-joint order, radian units, finite values, fake SO-101 limits, velocity limit, sequence and freshness before `FakeFollowerOutput.apply` | Fake simulation only |
| Dual-arm teleoperation | `pair-a` / `pair-b` → `follower-a` / `follower-b` | Independent per-follower ownership; same follower cannot be leased by another source | Fake simulation only |
| Blockly/program | `simulate` → `MuJoCoSimulation.execute` → `_move` | Runtime lease plus gate for each generated six-joint target, using the simulation model's actuator limits before `data.ctrl` | MuJoCo simulation only |
| VLA proposal | `policy_run` → `PolicyManager.run` → `execute_policy_action` → `_move` | Lease held through inference; provider timeout/generation check; named joint contract; gate each target before `data.ctrl` | `MOCK_MODEL`/local inference simulation only |
| MQTT command | `MqttTransport._on_message` | A `LocalSafetyController` is mandatory to connect; controller readiness and physical lease are checked before acceptance/dispatch | Disabled: `hardwareEnabled=false`, `VISTA_IOT_ENABLED` remains off |
| Recording replay | Renderer `recordingsView` → Twin `setFrame` | No execution API exists; replay frames are visualization-only | Visualization only |
| Physical serial adapter | `LeRobotSO101Adapter.send_action` | Injected follower writer is invoked only as the sink of `LocalSafetyController.validate_joint_action`; requires six ordered radian values, explicit verified joint limits, calibration, hardware authorization and a configured hardware stop strategy | Software adapter path tested with mock LeRobot follower only; production remains hardware-disabled |

Emergency stop clears all leases, cancels MuJoCo, invalidates in-flight VLA generations without waiting for inference, and stops fake teleoperation. It remains latched until an explicit reset; reset returns the runtime unarmed. Serial disconnect/read failures and runtime shutdown latch stop. A restart creates no active lease.

## Acceptance status

- Local fake/simulation safety tests: run through the targeted test commands listed in the release report.
- MQTT production: not run; the transport remains opt-in and the controller reports not ready.
- Physical robot: not run. Physical output is unavailable, and the current SO-101 adapter is read-only.
- Replay-to-physical: no such command path exists.

## Hardware acceptance checklist (future, supervised)

1. Keep `VISTA_IOT_ENABLED` unset and confirm `hardwareEnabled=false` at startup.
2. Confirm the physical emergency-stop circuit independently; the software latch is supplementary.
3. Verify adapter firmware, role, identity, serial ownership and calibration provenance for each arm.
4. Verify measured six-joint order, units, limits, velocity limits and a safe stop mechanism from the actual adapter documentation.
5. With the physical E-stop available, approve an explicit hardware-enable workflow and test only one isolated follower at low speed.
6. Verify watchdog expiry, USB removal, runtime kill and app shutdown each stop output without automatic resume.
7. Reset the physical and software E-stops explicitly, then verify a new operator arm is required.
8. Test the second pair independently; verify pair ownership, disconnect and stop behavior before dual-arm movement.
9. Keep replay and VLA in simulation until a separate hardware acceptance is approved.

## Remaining blockers

- `send_action` software adapter now exists and is mock-tested through the unified gate. No project-verified SO-101 position limits or safe-stop handler is configured, so physical writes remain blocked.
- Physical calibration bus writes in `edge/calibration.py` require the maintenance authorization callback. Runtime default (`fakeRobot=true`, `hardwareEnabled=false`) blocks starting the workflow. A separately approved maintenance commissioning path is still needed.
- MQTT is not instantiated by `EdgeRuntime` or Electron, and production dispatch stays disabled. The transport now refuses connection without the unified controller; end-to-end MQTT dispatch remains unverified.
- There is no physical trajectory-replay or physical VLA execution path, by design.
