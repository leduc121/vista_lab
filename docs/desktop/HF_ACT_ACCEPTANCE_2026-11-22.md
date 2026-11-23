# Hugging Face ACT checkpoint preflight — 2026-11-22

## Current status — inference-only follow-up

**Real ACT inference passed; simulation execution was not authorized and was not attempted.** The later instruction authorized inference despite unresolved actuator semantics, while prohibiting model actions from reaching MuJoCo, Digital Twin, serial ports, or hardware. The checkpoint output is only a six-value model tensor; its values are not verified SO-101 commands.

The real `model.safetensors` was loaded using isolated LeRobot 0.6.1 CPU and the serialized pre/postprocessor pipelines. `select_action()` ran once against deterministic synthetic observations matching the checkpoint's declared schema. A nonempty prompt was accepted by the ACT adapter and discarded at its boundary; task preprocessing received the empty task string and inference completed. The returned action had shape `[6]` and all values were finite. This is not actuator validation or task-quality evaluation.

An initial attempt stopped because the preserved conservative memory guard saw 534 MiB available against a 591 MiB estimate. A fresh preflight later passed at 2,156,703,744 bytes against the same 620,099,208-byte estimate. No guard was bypassed. Simulation mapping, MuJoCo, Digital Twin telemetry, Stop/Unload UI behavior with this real model, and physical I/O were not exercised.

## Candidate and revision

- Repository: `BoyuZhao/so101-act-pick-and-place`
- Exact Hub revision inspected: `c50534403a6635052f2abeeef5a9e74fe703fc51`
- License metadata: MIT
- Downloaded artifact: `model.safetensors`, 206,699,736 bytes (196.98 MiB), SHA-256 `ea3b391bf151cdebddb6551b52f494dedd132534dcd9807a54484d6d9e1bff0f`. It is in `/tmp/vista-so101-act-checkpoint`; only this weight file and the previously reviewed small metadata/processor files were staged. No repository code was downloaded or executed.
- The model card states that the original `use_degrees` setting could not be established from the saved training config. Its recorded LeRobot source is a JoyandAI fork at package 0.5.2; VISTA's adapter currently targets upstream LeRobot 0.6.x.

### Isolated inference environment

- Python 3.12.14 at `/tmp/vista-policy-env312`; Edge's Python environment was not modified.
- PyTorch `2.11.0+cpu`; torchvision `0.26.0+cpu`; LeRobot `0.6.1`; NumPy `2.2.6`; Hugging Face Hub `1.33.0`; safetensors `0.8.0`.
- PyPI does not publish LeRobot 0.6.2; 0.6.1 is the available 0.6.x release accepted by Python 3.12 and the adapter version check.
- `PreTrainedConfig` parsed this as ACT with six state and action values and front/wrist `(3,480,640)` visual inputs. LeRobot 0.6.1 constructed the serialized processor pipelines, loaded the pinned state dict strictly, and completed one real `select_action()` call. This demonstrates inference compatibility for this checkpoint/version pair; it does not establish compatibility for every LeRobot 0.5.2 fork checkpoint.
- Other installed versions: `huggingface-hub==1.33.0`, `safetensors==0.8.0`, `opencv-python-headless==4.13.0.92`, `einops==0.8.2`, `draccus==0.11.6`, `gymnasium==1.4.0`, `Pillow==12.3.0`, `packaging==25.0`, `requests==2.34.2`, `PyYAML==6.0.4`, `cmake==4.1.3`. A complete `pip freeze` was captured in the run; environment remains under `/tmp`.

Exact isolated environment package freeze:

```text
Farama-Notifications==0.0.6
Jinja2==3.1.6
MarkupSafe==3.0.3
PyYAML==6.0.4
anyio==4.16.0
certifi==2026.11.20
charset-normalizer==3.5.2
click==8.5.1
cloudpickle==3.1.3
cmake==4.1.3
draccus==0.11.6
einops==0.8.2
filelock==4.2.4
fsspec==2026.9.0
gymnasium==1.4.0
h11==0.16.0
hf-xet==1.8.0
httpcore==1.0.9
httpx==0.28.1
huggingface_hub==1.33.0
idna==3.20
lerobot==0.6.1
mergedeep==1.3.4
mpmath==1.3.0
mypy_extensions==1.2.0
networkx==3.7
numpy==2.2.6
opencv-python-headless==4.13.0.92
packaging==25.0
pillow==12.3.0
requests==2.34.2
safetensors==0.8.0
setuptools==78.1.0
sympy==1.14.0
termcolor==3.3.0
toml==0.10.2
torch==2.11.0+cpu
torchvision==0.26.0+cpu
tqdm==4.70.1
typing-inspect==0.9.0
typing_extensions==4.16.0
urllib3==2.8.0
```

### Inference result

- Device: CPU; no accelerator available.
- Input fixture: zero `float32[6]` state plus seeded random `uint8[480,640,3]` front and wrist images. These values only match schema; they are not captured SO-101 telemetry.
- Prompt: `Move the red cube beside the blue cup.` ACT is non-language-conditioned. The adapter supplied `task=""` to LeRobot observation preparation and did not pass a prompt argument to `select_action()`.
- `select_action()` calls: 1; load time 5.25 s; inference time 1.05 s.
- Postprocessed output: six finite values; SHA-256 `f124c0df0cebb13639be7e1733350dd9a7a3938361ed9b5fb45827cac662aebd`. Values are intentionally not presented as robot targets.
- Action mapping: not run. MuJoCo: not run. Digital Twin: not run. Serial/hardware: not accessed.

### Alternative simulation checkpoints investigated (metadata only)

| Candidate | Positive evidence | Gaps for VISTA MuJoCo | Assessment |
| --- | --- | --- | --- |
| `wenyixu101/so101-act-sim-pick-and-place` | ACT, 51.7M parameters, Apache-2.0; checkpoint reports 60 evaluation rollouts in its matching Farpoint/Isaac Lab scene; front/wrist 640×480 inputs. Immutable Hub revision `aeadc17921bd99fd7b377b40130b4f837494d7a7` (card release `v0.1.0`), model SHA-256 `6f855636a9a744cac1dfc1c2abab2f9479e7186c2ff3d9cee7ce585db10927fe`. | Model card and `train_config.json` omit action units; exact VISTA MuJoCo scene transfer is unknown. A linked evaluation template gives ordered `.pos` joint names but lists LeRobot 0.4.4; installed adapter compatibility needs a check. Reported success is 13/60 (21.7%), not a reliable controller. | **Recommended next ACT candidate** for metadata-gated acceptance; do not apply actions until the missing units and scene mapping are proven. |
| `sreetz-nv/so101_dr500_pi05_h32_b32_50k_20260929` | Simulation-trained SO-101; card identifies LeRobot 0.6.0, joint order, arm degrees/gripper percent, included processors and relative-action decoding. | π0.5, 4B parameters, Gemma license; evaluation is pending; not an architecture supported by the current VISTA adapters and may exceed CPU memory limits. | Better-documented action contract, but not a practical next run with this runtime. |
| `BoyuZhao/so101-act-pick-and-place` | Small ACT inference bundle, MIT; real inference was verified above. | Real-robot training provenance; action units and joint order unresolved; no MuJoCo matching evidence. | Inference-only acceptance complete; excluded from simulation. |

Only metadata was fetched for the first candidate: pinned README/config/train config/processor JSON and normalization-state files total 37,307 bytes. No alternative checkpoint weights were downloaded. The ACT candidate's dataset card documents simulation-generated joint-position targets and front/wrist cameras; its linked rollout template names the joints and control-speed profile but neither provides a complete unit declaration in the checkpoint metadata. Keep the MuJoCo action gate closed until that contract and the scene mapping are independently verified.

## Metadata findings

- `config.json`: architecture ACT; `observation.state` shape `[6]`; `observation.images.wrist` and `.front` shapes `[3,480,640]`; `action` shape `[6]`; normalization mapping is MEAN_STD for visual/state/action; chunk size/action steps 100; serialized device is CUDA; declared ImageNet ResNet-18 backbone initialization.
- `train_config.json`: `robot` is null, `use_degrees` is null, `dataset.features` is absent, and `rename_map` is empty. It therefore does not provide an authoritative six-joint feature order or degree/radian/gripper unit declaration.
- Processor JSONs reference state files for the MEAN_STD normalizer and action unnormalizer. Both state files were decoded locally; their stored tensors include six-value state/action mean, standard deviation, min/max and quantiles. Example action mean is `[1.1404, -46.5040, 41.4412, 74.1728, 3.7904, 10.4997]`. These values suggest magnitudes but do not prove units or semantic joint order, so no unit inference is made from them.
- Observation dimensions and camera keys match the adapter's available input interface. Matching camera viewpoints, scene/task distribution, action units and joint ordering have not been established.
- The model card says the checkpoint was produced with a 0.5.2 LeRobot fork, while the implemented adapter requires 0.6.x. Metadata inspection alone does not prove processor/checkpoint compatibility across that version difference.

## Metadata-only downloads

All artifacts below are pinned to the exact revision above. Total metadata: **28,225 bytes** (weights excluded from this table). SHA-256 values were computed after download; Hub LFS SHA-256 was checked where supplied.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `LICENSE` | 1,085 | `e9f37c7acadb2db0686f3550991001b02a1af4238c135179f57b765cc8fd2724` |
| `README.md` | 3,730 | `21beffb06691740b8012b5f79d217cb91d7fb8db88ca845f681645ce310e10fd` |
| `config.json` | 1,738 | `4373a82fcb93464a53af5839155e15c938f535936ddf8914e8fe5a97caaba1f5` |
| `policy_postprocessor.json` | 691 | `e359584c9f74e9c6ffe6f801512642d97bb15610a7879e245bda5269b7d6dcc1` |
| `policy_postprocessor_step_0_unnormalizer_processor.safetensors` | 7,552 | `331dc10d9ac306ca8ef0f94e8f91a655b577d90238a36cd2e6f440926b300c7a` |
| `policy_preprocessor.json` | 1,391 | `5049a30cf5e175679f3bbf4d843491cc722c34e5776e8edf9049a82c6813209c` |
| `policy_preprocessor_step_3_normalizer_processor.safetensors` | 7,552 | `331dc10d9ac306ca8ef0f94e8f91a655b577d90238a36cd2e6f440926b300c7a` |
| `train_config.json` | 4,486 | `328dcd5a98b08c42cf0ffb069893f770a064a96653faa9ef3fb919dbaafb61eb` |

Metadata was staged under `/tmp/vista-so101-act-metadata`; neither metadata nor weights were installed into the Desktop managed policy registry. The approved checkpoint weight is staged separately as detailed above.

## Resource and environment preflight

Initial snapshot before installing isolated dependencies or downloading the approved weight:

- RAM: 15,522,283,520 bytes total; 5,611,545,576 bytes available.
- Swap: 4,294,963,200 bytes total; 972,595,200 bytes free.
- Workspace filesystem: 234,859,679,744 bytes available.
- GPU: unavailable (`nvidia-smi` could not communicate with the NVIDIA driver).
- Edge environment: Python 3.11.16, MuJoCo 3.17.0, NumPy 2.4.6; no LeRobot, Torch, Transformers, safetensors or HF Hub.
- Separate existing environment: Python 3.14.6, LeRobot 0.6.2 and Torch 2.11.0+cu130; no Transformers or MuJoCo, CUDA unavailable, and dependency versions conflict with LeRobot's declared NumPy/Hub constraints.
- This was the initial snapshot only; the isolated Python 3.12 environment was installed afterward. The Edge environment and system packages were not modified.

Fresh snapshot immediately before model weight download:

- RAM total: 15,522,283,520 bytes; available: 3,388,371,072 bytes.
- Swap total: 4,294,963,200 bytes; free: 5,726,208 bytes.
- `/tmp` free: 5,281,820,672 bytes; workspace filesystem free: 233,815,760,896 bytes.
- Downloaded weight: 206,699,736 bytes; policy-loader conservative estimate: 620,099,208 bytes.
- Before inference, a later fresh conservative guard measured 2,156,703,744 bytes available; the 620,099,208-byte gate passed. Host `free` reported 4,525,535,232 bytes available and swap had 32,968,704 bytes free at that snapshot.

## Acceptance status

| Gate | Result |
| --- | --- |
| Public repo, exact revision, license and required artifact list | PASS |
| Architecture, input/output dimensions, image keys and normalization pipeline | PASS (metadata inspection only) |
| Normalization state files decoded | PASS (statistics inspected; no semantics inferred from them) |
| Six-joint semantic order verified | **BLOCKED** — no feature names/order in checkpoint metadata |
| Action units and SO-101 action semantics verified | **BLOCKED** — `use_degrees` and robot config are null; model card states units are unresolved |
| Isolated dependency compatibility | PASS for this ACT inference on LeRobot 0.6.1 / Torch 2.11.0 CPU; Python 3.11 cannot install 0.6.x, so Python 3.12 was used |
| Model weights downloaded/hash recorded | PASS — one approved file, exact SHA-256 and byte size above |
| Real `select_action()` inference | PASS — one successful call; six finite postprocessed values |
| Prompt accepted and ignored by ACT | PASS for the checkpoint adapter call; the nonempty prompt is not sent to ACT and `select_action()` ran |
| Runtime action semantics / joint order validation | **BLOCKED for actuator use** — deliberately not inferred or mapped |
| MuJoCo policy action and Digital Twin telemetry from this checkpoint | **NOT RUN / NOT AUTHORIZED** |
| Serial/physical motion | NOT USED; output remains disabled |

Deterministic regression tests cover adapter prompt discard, inference-only vs robot mapping, six-joint unit-contract rejection and stale-result cancellation. They are separate from the real checkpoint inference above. Before any future simulation acceptance for this checkpoint, obtain authoritative training/recording metadata for joint order and mixed SO-Follower units (five arm joints and gripper convention), then independently validate VISTA's action mapping and safety bounds.
