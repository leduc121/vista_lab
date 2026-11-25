# Optional Phase 7 — AI/VLA adapter status

## Implemented

- `ModelProvider` defines the local policy adapter boundary. The LeRobot implementation remains the production provider; tests use a separately labelled `MOCK_MODEL` fixture.
- Observation capture uses the declared LeRobot input schema: six-joint state plus only the camera views declared by the model. Available views are rendered from the local MuJoCo scene. No physical camera adapter is currently connected.
- SmolVLA receives the instruction; ACT is non-language-conditioned and ignores it. Both use pinned local checkpoint artifacts and CPU inference.
- Proposals must map to the ordered six-joint SO-101 radians contract. The simulation checks MuJoCo actuator limits before execution. Hardware motion remains unavailable.
- Each run reports provider/model revision and measured inference latency. A 25-second proposal budget discards late results; Electron kills and restarts a wedged edge process after its 30-second request timeout. Stop/unload increments the policy generation so stale inference cannot be executed after it returns.
- Experiment/attempt/episode metadata accepts only UUID fields. If a local recording is active, its experiment and episode IDs are attached without creating an Education API contract.
- Validated simulation proposals and compact joint/camera-view observation metadata are appended to `userData/recordings/vla-actions/actions.ndjson` with restrictive local permissions. Natural-language instructions are hashed, not stored in plaintext.
- Model import is explicit. The adapter checks declared bundle sizes and available disk space before downloading; load checks available RAM before model construction.

## Verification and model status

- Targeted Edge tests exercise mock-provider labeling, action shape/unit validation, timeout and stale-result discard, experiment context, disk preflight, and the MuJoCo simulation route.
- Node tests exercise private local action recording, instruction hashing, metadata, and fail-closed physical/malformed proposals.
- **MOCK_MODEL**: test fixture only. It is not exposed as an installable UI provider and does not establish model inference quality.
- **Real ACT inference** was previously verified for one pinned checkpoint in an isolated Python 3.12 / LeRobot 0.6.1 / Torch CPU environment; see `HF_ACT_ACCEPTANCE_2026-11-22.md`. It was inference-only and is not VLA or task-quality verification.
- **SmolVLA inference: NOT VERIFIED.** The default packaged Edge runtime is Python 3.11 and does not include LeRobot/Torch. The optional `requirements-edge-robot.txt` targets LeRobot 0.6.1 but must be installed and validated in a dedicated Python 3.12 environment. The verified ACT checkpoint is about 197 MiB and its previous preflight estimated about 591 MiB minimum available RAM; actual model-specific needs vary.
- No model was downloaded or loaded during this phase. No GPU, cloud inference, paid AWS service, or physical robot was used.

## Remaining safety blocker

Current VLA actions are limited to the local MuJoCo simulator and revalidated against its model limits. The repository does not yet expose one shared `LocalSafetyController` instance used by VLA, fake teleoperation and the optional MQTT transport. MQTT's transport requires an injected readiness gate and Production remains disabled. Therefore this phase does **not** authorize or claim physical VLA execution. Unify and independently test the source-agnostic safety controller, command watchdog, velocity limits, E-stop priority and cancellation semantics before any physical path is considered.

There is no student-facing attempt scope in the current VLA panel unless a local recording supplies its experiment/episode IDs. Do not use this local action log as uploaded evidence or as a replacement for a backend contract.
