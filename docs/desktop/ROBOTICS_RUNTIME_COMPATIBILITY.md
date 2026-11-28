# Optional Robotics Runtime Compatibility

This is an acceptance-preparation profile; Linux RC 0.1.0 remains unchanged. It uses the existing `edge/runtime.py` and `LocalSafetyController`, not a second command stack or safety authority. It defaults to `fakeRobot=true` and `hardwareEnabled=false`.

## Dependency profile

`edge/robot-runtime/pyproject.toml` and `uv.lock` pin a separate Python 3.12 CPU profile: LeRobot 0.6.1 with Feetech, PyTorch 2.7.1 CPU, TorchVision 0.22.1 CPU, NumPy 2.2.6, MuJoCo 3.17.0, Paho MQTT 2.2.0, PySerial 3.5, PyInstaller 6.19.0, and CMake 3.31.6. The lock has 62 resolved packages and records package hashes and explicit PyTorch CPU index. It does not include CUDA, NVIDIA packages, or AI checkpoints.

Recreate on an Ubuntu demo host with uv-managed Python (no system Python change):

```bash
uv python install 3.12.14
uv sync --locked --project edge/robot-runtime --python 3.12.14
uv pip check --python edge/robot-runtime/.venv/bin/python
```

Run a simulation-only health/status/shutdown probe using the shared runtime source:

```bash
printf '%s\n' \
  '{"id":"health","method":"health"}' \
  '{"id":"status","method":"status"}' \
  '{"id":"stop","method":"stop"}' |
  PYTHONPATH="$PWD" edge/robot-runtime/.venv/bin/python edge/runtime.py
```

The Desktop Settings page now has explicit Simulation and Robotics profiles. The packaged app still uses its bundled Python 3.11 executable for Simulation. Robotics requires the operator to select the isolated Python executable and an Edge source directory containing `edge/runtime.py`; Settings validates Python 3.12, CPU-only Torch, LeRobot, SO101 leader/follower imports, MuJoCo and PySerial before switching. It shuts down the current child first and refuses a switch while a robot is connected or execution is active. It never connects an arm when selected. Because source redistribution rights for checkIk-derived files are not confirmed, the Edge source tree is not bundled in a new artifact; point the optional profile to the authorized local checkout. `fakeRobot=true` and `hardwareEnabled=false` remain enforced by runtime defaults.

## Verified in project environment (2026-11-28)

- Exact command `uv sync --project edge/robot-runtime --locked --python 3.12`: passed; Python 3.12.14; LeRobot 0.6.1; Torch `2.7.1+cpu`, `torch.version.cuda is None` and CUDA unavailable; NumPy 2.2.6; MuJoCo 3.17.0; pySerial 3.5; Feetech SDK 1.0.0; TorchVision 0.22.1+cpu; Paho 2.2.0; PyInstaller 6.19.0; CMake 3.31.6.
- Public LeRobot 0.6.1 SO-101 imports/configs, the `LeRobotSO101Adapter`, and `CalibrationWorkflow` imported successfully. Signature inspection confirmed the adapter's `connect(calibrate=False)`, leader `get_action`, follower `get_observation` / `send_action` APIs. No physical connection, serial enumeration/open, calibration read/write, or motor command was made.
- 56 mocked tests passed under the project interpreter: Runtime/adapter, calibration, serial ownership, safety controller and teleoperation suites.
- `EdgeSupervisor` launched the selected project Python and this source checkout. Robotics driver readiness was true, but diagnostics correctly remained `ACTION REQUIRED`: follower disconnected and uncalibrated, `hardwareEnabled=false`, `motionEnabled=false`. The app does not auto-connect or arm.
- Packaged Ubuntu 0.1.1 Electron Demo/Simulation smoke passed after installation. The package continues to use its bundled Simulation Edge executable; the optional Robotics Python path remains an explicit external selection. The external project `.venv` is gitignored and not bundled. No model checkpoint was downloaded.

## Runtime choice

**Recommend option B:** preserve the verified Python 3.11 simulation profile and use the optional Python 3.12 profile only for authorized robotics acceptance. Both profiles use the same Edge Runtime source and LocalSafetyController. The supervisor owns a single child and awaits its exit before switching. The packaged Python 3.12 profile requires externally maintained Python/source paths; it is not self-contained, and a running profile is still simulation-only until physical commissioning authorization and safety limits are accepted.
