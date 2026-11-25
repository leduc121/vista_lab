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

## Verified in isolated `/tmp` environment

- Python 3.12.14; Torch `2.7.1+cpu`; `torch.version.cuda is None`; `torch.cuda.is_available() is False`.
- NumPy 2.2.6; LeRobot 0.6.1; Feetech SDK 1.0.0; MuJoCo 3.17.0; PyInstaller 6.19.0; Paho 2.2.0; PySerial 3.5.
- `uv.lock --check` and `uv pip check`: pass (62 locked packages / 57 installed runtime metadata entries checked after sync).
- `SO101Follower` and `SO101Leader` classes imported and initialized with fake path strings; both report disconnected. No `.connect()` call, serial open, calibration read/write, or motor command occurred.
- Shared Edge Runtime source under Python 3.12 reports `lerobot=true`, `mujoco=true`, MuJoCo simulation available, `fakeRobot=true`, `hardwareEnabled=false`; shutdown passes.
- Electron `EdgeSupervisor` launched the Python 3.12 profile and returned `READY`, `SIMULATION`, `lerobot=true`, `mujoco=true`; the child shut down before any other runtime was started.
- Native Electron smoke verified the Settings profile selector and hardware-disabled status. It did not invoke the file picker or connect hardware.
- Existing mock `send_action` test through LocalSafetyController: pass, 1/1 under Python 3.12.
- Temporary environment footprint: approximately 1.2 GiB. This includes CPU Torch, TorchVision, MuJoCo, OpenCV and build/test dependencies. No model checkpoint was downloaded.

The verified interpreter used for the current supervisor probe is still under `/tmp`; the Desktop does not hardcode or depend on that path. The lockfile is the reproducible installation source. On the demo host, recreate it in `edge/robot-runtime/.venv` and select that interpreter in Settings. This environment is not committed or bundled.

## Runtime choice

**Recommend option B:** preserve the verified Python 3.11 simulation profile and use the optional Python 3.12 profile only for authorized robotics acceptance. Both profiles use the same Edge Runtime source and LocalSafetyController. The supervisor owns a single child and awaits its exit before switching. The packaged Python 3.12 profile requires externally maintained Python/source paths; it is not self-contained, and a running profile is still simulation-only until physical commissioning authorization and safety limits are accepted.
