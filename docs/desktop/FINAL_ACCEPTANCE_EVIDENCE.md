# VISTA Final Acceptance Evidence — 2026-11-25

## Final overnight reconciliation — 2026-11-27

This is the current evidence summary and supersedes older status statements below where they differ. It reconciles the supplied VISTA Master Prompt, the final Claude handoff, current Desktop implementation, package checkpoint and current Production source. Do not read local/fake tests as Cloud or physical acceptance.

### Source, PR, CI and package

- The final implementation and evidence changes are on a follow-up branch based on current `main` (`e2f03cc`), distinct from merged PR #6. The branch, commit, PR and current Actions result are recorded in the distribution handoff and PR; earlier native runs on the prior head were **CANCELLED**, not CI PASS.
- The private Ubuntu amd64 DEB checkpoint is version `0.1.1`, built from source `13fd11fa031168ed1d237784293c00b35d5794ca`; size `148156302` bytes; SHA-256 `402aeca230f4362f0f1e2f2336b606c340cee776478a94595fdf1f4c8a2a7e42`. Package metadata is `vista-lab-station`, `0.1.1`, `amd64`; dependencies are GTK, NSS, XSS, XTest, XDG, AT-SPI, UUID and Secret Service libraries. The launcher is `/opt/VISTA Lab Station/vista-lab-station`. Package extraction, runtime/startup checks and checksums passed for that build; it was not installed system-wide or published.
- The local package provenance says `workflow_run_id=unavailable-local-build`, so it is not a GitHub Actions build artifact. Its four-file `SHA256SUMS` passes; the CycloneDX Python runtime SBOM and 568-file third-party license/notice archive are included and checksummed. The later MQTT correction in this report is not in that DEB; the final PR's native Ubuntu Actions artifact must be checked against the final source SHA before claiming a package for that revision. v0.1.0 remains untouched. No Windows/macOS package is part of the release handoff.

### Implementation and test status

| Area | Current status | Evidence boundary |
|---|---|---|
| R1 physical SO-101 adapter | **IMPLEMENTED / SYNTHETIC TESTED; PHYSICAL NOT RUN** | LeRobot 0.6.1/0.6.2 follower adapter, measured named joints, exclusive serial ownership and safety-gated output exist. The default runtime denies hardware connection; the optional Python 3.12 LeRobot environment is external to the DEB. No serial device, calibration write or physical motion occurred. |
| Safety Controller | **IMPLEMENTED / TESTED IN FAKES** | Shared source gate covers owner lease, arming, E-stop latch, watchdog, command freshness, joint/velocity limits and shutdown. No physical E-stop circuit or stop behavior was verified. |
| MQTT commands/mTLS | **IMPLEMENTED / FAKE TESTED; AWS NOT RUN** | Command identity, expiry, deduplication and ACK/execution lifecycle tests use an injected broker. No certificate/principal is attached; no real mTLS connection or command was sent. |
| Device Shadow | **IMPLEMENTED LOCALLY; PRODUCTION FRESHNESS UNVERIFIED** | Desktop reports runtime state and 10-second heartbeat in local transport tests. Production Edge at `f0b3d8735b608aac8670a200ff45eddf6fa24ab5` reports on connect/command without an idle heartbeat; no fresh Shadow was verified. |
| Simulation telemetry | **LOCAL CONTRACT PASS; CLOUD BLOCKED** | Desktop now wraps live MuJoCo callback frames as correlated `status/telemetry` events and enforces ≤2 Hz / ≤120 frames per command. Focused tests passed 16/16; the complete `edge/.venv` suite passed 96/96. Production R1 still emits an uncorrelated legacy `/telemetry` payload that the deployed rule/bridge drops. |
| Physical measured telemetry | **MEASURED READ API IMPLEMENTED; CLOUD NOT RUN** | Adapter reads actual named follower observations; no physical measurement was taken and no physical MQTT/Twin frame was accepted. The deployed Production bridge cannot establish a ready Cloud path until its Edge publisher and Shadow heartbeat are corrected. |
| Student authentication | **IMPLEMENTED / CONTRACT TESTED; DESKTOP LIVE FLOW NOT RUN** | Desktop uses the existing authenticated Education API session contract. The Master Prompt reports Student 1's existing Production eligibility and access checks; this does not prove Desktop-to-Production experiment persistence. |
| Recording/evidence | **LOCAL INTEGRITY TESTED; PRODUCTION UPLOAD/REVIEW NOT RUN** | `vista.robot.recording.v1` manifest/hash handling and the local mock recording fixture pass. Upload remains restricted to verified stopped physical recordings; simulation is not uploaded through that route. No Cloud evidence or instructor review is claimed. |
| Registered dual-arm scope | **LOCAL PAIR WIRING RETAINED; CLOUD SINGLE FOLLOWER ONLY** | Two leader/follower pairs remain in local registered scope; physical dual-arm acceptance is not run. Existing Cloud Thing/Twin owner supports one follower only; do not claim dual-arm Cloud. |

### Actual acceptance performed

- **Local hardware-disabled simulation:** the complete Edge suite passed 96 tests, including an actual MuJoCo-backed fake-broker command lifecycle and local recording-integrity contract. It is **NOT Cloud acceptance** and creates no Production student result.
- **Production data/access:** the latest supplied Master Prompt reports the existing entitlement, VISTA Academy isolation, Blockly profile, School Admin allocation, instructor visibility, symbolic prerequisite and Student 1 eligibility completed; Student 2 and foreign-organization access were denied. This pass did not freshly query the database. VISTA Academy isolation was verified only against DB state, not through an Academy student login.
- **Read-only Production/AWS checks from this session:** API health/readiness returned healthy/ready; version was `f0b3d873…`; the existing feedback/recording queues had zero visible, in-flight and delayed counts at inspection; the existing Thing had no principal. These are point-in-time checks. The current IoT data-endpoint read was blocked by the shell's network boundary, so Shadow state/freshness is **NOT VERIFIED**.
- **Cloud simulation:** **NOT RUN**. The current Production Edge telemetry/heartbeat mismatch, absent certificate, unverified Shadow and unapproved Phase A activation are blockers.
- **Physical SO-101:** **NOT RUN**. No hardware, serial, calibration, arming, motion, physical telemetry or physical recording upload was used.
- **Latency:** **NOT MEASURED**. Use the timing procedure in [AWS Acceptance Runbook](AWS_ACCEPTANCE_RUNBOOK.md) during actual Cloud acceptance; do not reuse a source estimate.

### Remaining owner gates and ordered next actions

1. Backend owner authorizes and deploys the smallest fix for command-correlated simulation telemetry on the Production rule's accepted `/status` topic and an idle Shadow heartbeat ≤10 seconds. Then verify the live SHA and fresh honest `MOCK_RUNTIME`/hardware-disabled Shadow. Desktop cannot change the separate Backend checkout in this session.
2. After that fix, the owner approves creation of one inactive device certificate, attachment to the existing Thing and scoped policy, then activation on the Edge host. Run the mTLS and Shadow-read verification; keep Backend MQTT start flag off during that check.
3. Owner approves the existing Phase A secret update and Education CI `action=deploy` with `aws-demo` approval only after certificate, Shadow, API/worker/Twin health and the already-provisioned dataset are confirmed. No Production database changes are pending per the latest Master Prompt.
4. Run the actual Student 1 Cloud simulation workflow on the existing R1126-1901 assignment/attempt, verify correlation, authorization, lifecycle, Twin simulation provenance, evidence and instructor review, and record measured latency. Do not use direct MQTT command publication.
5. Tomorrow's physical session remains separate: owner/operator approval, exact Python 3.12/LeRobot environment, one `leader-a`/`follower-a` pair only, verified calibration and safe-stop configuration, then minimal supervised local motion. Phase B Cloud physical configuration requires a later separate approval and successful Cloud simulation first.

### Defense demonstration and offline fallback

**Live Production demonstration is conditional and not presently accepted.** Do not show unavailable Cloud connection, fresh Shadow, Cloud MuJoCo frame relay, instructor evidence or physical motion as if completed. When the Cloud gates pass, demonstrate: existing classroom/assignment and Student 1 prerequisite → Desktop sign-in/runtime profile → actual mTLS and fresh Shadow → authorized simulation start → correlated ACK/executing/completed → delayed, correctly labelled Twin frames → supported result/evidence → instructor review. Add the physical step only after its own supervised acceptance.

**Offline fallback (clearly label every view “LOCAL OFFLINE SIMULATION — NOT CLOUD / NOT PHYSICAL”):** start the Desktop Demo/simulation profile with `VISTA_IOT_ENABLED` unset; show the bundled SO-101 MuJoCo model, bounded Blockly action, measured six-joint simulation frames, safe stop and local result. Use Demo fixtures only; do not sign into a student account or imply server persistence. Do not rely on connected hardware.

### Rollback and shutdown

- Cloud Phase A: disable IoT first or restore the recorded prior Secrets Manager version, then use the existing Education CI `action=deploy` reload; verify student IoT start is refused and workers/Twin are healthy. Do not mutate other secret values or run a Backend rollback without owner approval.
- Device: stop runtime, ensure no active command, close MQTT, set the approved certificate inactive, detach policy and Thing principal, and delete only that specifically created certificate if the owner chooses rollback. Keep private key only on the designated Edge host or securely remove it per owner direction.
- Physical: stop motion with the verified safe-stop, E-stop if needed, disarm, release the control lease, disconnect leader then follower, verify port ownership released and no active command, shut down Edge, and close the owner-authorized window. Never leave the robot armed or auto-resume after reconnect.

## Final project closure and Claude handoff — owner-reported release, 2026-11-25

The owner states that Ubuntu v0.1.0 completed its approved release process. This workspace has no refreshed Draft/release manifest or owner-tested artifact record, and its previous anonymous GitHub fetch failed because DNS/network access was unavailable. Treat the owner statement as the release approval; treat the exact public asset, source tag, checksum, and anonymous-download state below as **not independently verified here**.

| Release metadata | Handoff value | Evidence state |
| --- | --- | --- |
| Product / version / platform | VISTA Lab Station 0.1.0 / Ubuntu amd64 DEB only | Product and platform scope from owner instruction and prior distribution handoff. |
| Public Release URL | `https://github.com/leduc121/vista_lab/releases/tag/v0.1.0` | Canonical URL, not fetched from this workspace. |
| DEB URL | `https://github.com/leduc121/vista_lab/releases/download/v0.1.0/VISTA.Lab.Station-0.1.0-amd64.deb` | Canonical URL, not anonymously downloaded or verified here. |
| Final file size / SHA-256 | **Not confirmed for the published asset** | Local records conflict: old Draft copy `131,395,882` bytes / `a5dbca4d54a28de1aae2f254b08484460efb3db6a3eeee7828d8dc24ea3ba8e4`; corrected workspace candidate `296,291,230` bytes / `8eb5d74c23a3be4d2164f7e58bbbb0938467240cead40eabc328e846a29309b4`; staged RC DEB `106,264,490` bytes / `548cced6ddd16f18917b97d370e02d9026bee0c888d6615c823b9b8d07b4fef8`. Do not present one of these as the published hash without the actual release asset/checksum. |
| Source revision / tag provenance | **Not confirmed for published asset** | Prior handoff maps the old Draft artifact to source `80aef01eca657fa8a2dbe3340bac27e048619b11`; local current worktree HEAD is `ce00f230825ca9fdf35af87700e74308e85c7586` with uncommitted changes. The local repository has no `v0.1.0` tag. These facts do not identify the owner-approved release revision. |
| PR references | Historical refs: PR #3 merged in prior checklist; PR #4 and #6 mentioned in distribution records | Current merge/review state could not be queried. Do not claim a current PR merged based on those historic notes. |
| Supported OS evidence | Ubuntu amd64; Ubuntu 26.04.1 build/host evidence in prior handoffs | The exact published DEB's supported Ubuntu release range was not supplied in the refreshed owner acceptance record. Do not promise other releases. |

### Student-facing capability handoff

| Capability | Implemented / tested | Packaged availability and requirements | Acceptance |
| --- | --- | --- | --- |
| Simulation Lab | Bundled MuJoCo SO-101 execution, state telemetry, reset, completion, and shutdown tested; final local Electron smoke captured. | Available in the Ubuntu app; no physical arm, source checkout, Conda, GPU, or model download required. Demo/local simulation does not persist a real student experiment. | **PASS — local packaged simulation scope.** |
| Programming execution | Existing Web Blockly payload/validation and Desktop bounded execution contract tested, including invalid and duplicate commands, cancellation/failure and mock lifecycle. | Blockly UI is packaged. Real assignments, student authorization, save/submission and platform results require Web/Education API. | **PASS — local contract; live Desktop student journey not established.** |
| Joint control | Six-joint limits, units, state checks and simulated control tested. Physical motion dispatch remains disabled. | Simulation controls available; real arm requires operator Robotics environment, hardware and commissioning. | **PASS — simulation; physical BLOCKED.** |
| Cartesian control and FK/IK | Existing checkIk solver and FK/IK/reachability/finite/range checks exercised. | Experimental Simulation-only control. The recorded URDF/MuJoCo frame offset is about 19.8–20 mm. No physical orientation/control is supported. | **PARTIAL — safe rejection tested; target fidelity FAIL/experimental.** |
| Robotics Profile | Detection and fake/mock LeRobot paths tested. | UI is packaged; runtime requires operator-selected Python 3.12.14, locked LeRobot/Torch/MuJoCo/serial dependencies and authorized Edge checkout. Physical connection requires hardware. | **PASS — mock; ready physical profile BLOCKED.** |
| Calibration | Confirmation, role/port ownership and fake workflow tested. | Hardware calibration writes motor configuration and requires supported connected hardware and approved operator procedure. | **NOT RUN — physical calibration.** |
| Leader/follower teleoperation | Fake pair, deadman, watchdog, sequence, stop/reset and pair isolation tested. | Fake simulation path is available. Physical teleoperation is not implemented/commissioned in this release. | **PASS — fake; physical BLOCKED.** |
| Recording | `vista.robot.recording.v1`, timestamps, IDs, hash/size, stop/recovery contracts tested for supported local measured-joint streams. | Local recorder exists, but the Blockly MuJoCo run is not connected to it; no command/attempt/submission association or Desktop upload exists. | **PARTIAL — local manager; Simulation evidence integration BLOCKED.** |
| Replay | Stored episode visualization and read-only boundary implemented/tested. | Available for compatible local artifacts; never actuates hardware. | **PASS — visualization-only; physical replay disabled.** |
| Evidence integration | Local WF03 mock joins command/run/robot IDs through simulated execution and mock evidence response. | Web server artifact is `vista.experiment.telemetry.v1`; Desktop local format is `vista.robot.recording.v1`. No supported Desktop upload/association contract joins them. | **BLOCKED — Web/Claude handoff required.** |
| Safety controls | Shared controller, e-stop latch/explicit reset, stale/duplicate/range/finiteness/watchdog/disconnect/shutdown/replay guards tested in simulation and mocks. | Local paths available; physical stop circuit/commissioning is external. | **PASS — software tests; physical safety NOT RUN.** |
| AI/VLA | `MOCK_MODEL` proposal validation/timeout/safety path tested; ACT inference-only evidence exists. | Mock Simulation path only. ACT is not natural-language conditioned; real model/physical actuation not accepted. No weights downloaded in this release acceptance. | **PARTIAL — mock; physical AI BLOCKED.** |

Latest targeted test evidence: Python Edge suite **88 passed**; `npm test` **25 API/IPC/security contract checks and 18 Node tests passed**; JS source checks and renderer build passed; extracted corrected-candidate Electron/MuJoCo smoke passed. Actual screenshots: [MuJoCo workspace](evidence/final-freeze-mujoco-electron.png), [runtime profile](evidence/final-freeze-runtime-profile-electron.png). See [Student Lab Acceptance](STUDENT_LAB_ACCEPTANCE_2026-11-25.md), [Robotics Lab Acceptance](ROBOTICS_LAB_FINAL_ACCEPTANCE_2026-11-25.md), [Education Platform Integration Handoff](FINAL_EDUCATION_PLATFORM_INTEGRATION_HANDOFF_2026-11-25.md), and [Installation Acceptance](FINAL_INSTALLATION_STUDENT_UX_ACCEPTANCE_2026-11-25.md) for detail.

For a reproducible **QA-only Demo fixture**, run the packaged smoke harness with the locally accepted candidate executable:

```sh
VISTA_SMOKE_EXECUTABLE='/path/to/vista-lab-station' \
VISTA_SMOKE_RUN_LOCAL_MUJOCO=1 \
VISTA_SMOKE_VIEWPORT=1400x900 \
xvfb-run -a node scripts/electron-smoke.cjs
```

This opens a Demo student fixture and does not create a Web student record. Student classroom demonstrations should sign in with a course-issued student account and assigned lab; do not use the QA fixture as a real submission.

### Claude Code handoff: Web, WF03, WF04, and AWS

Use the [Education Platform Integration Handoff](FINAL_EDUCATION_PLATFORM_INTEGRATION_HANDOFF_2026-11-25.md) as the contract source. Its test fixture IDs are synthetic; do not reuse them as student or production identity.

#### Homepage copy and download handoff

- **Product:** VISTA Lab Station 0.1.0.
- **Platform:** Ubuntu amd64 DEB. Windows/macOS: **Coming Soon**. AppImage is not part of this release.
- **Download URL (owner-designated):** `https://github.com/leduc121/vista_lab/releases/download/v0.1.0/VISTA.Lab.Station-0.1.0-amd64.deb`.
- **Copyable download command:**

```sh
curl -fL "https://github.com/leduc121/vista_lab/releases/download/v0.1.0/VISTA.Lab.Station-0.1.0-amd64.deb" -o /tmp/vista-lab-station.deb
sha256sum /tmp/vista-lab-station.deb
```

The SHA value to compare is **not in the verified local release record** because three different local DEB hashes exist. Claude must fetch the published `SHA256SUMS`, identify the exact DEB row and verify the public bytes before adding a literal expected hash to the homepage. Then install with `sudo apt install /tmp/vista-lab-station.deb`; launch with `gtk-launch vista-lab-station`; uninstall with `sudo apt purge vista-lab-station`.
- **Description:** “VISTA Lab Station is a desktop client for assigned robotics labs, with Blockly programming and local SO-101 MuJoCo simulation. The optional Robotics Profile requires an operator-managed Python/LeRobot environment. Physical robot operation and cloud evidence require separate authorization and acceptance.” Do not promise physical motion, cloud persistence, or teacher review from Desktop alone.
- Use the exact public release size, SHA-256, and source/tag provenance only after verifying the published asset and its `v0.1.0` tag target. Historical local values in this report are not homepage checksum values.

- **Homepage:** Product is VISTA Lab Station 0.1.0 for Ubuntu amd64. Owner-designated DEB URL is above. The versioned asset name is recorded as `VISTA.Lab.Station-0.1.0-amd64.deb`. Windows/macOS are Coming Soon and AppImage is out of this release scope. Do not publish a checksum on the page until the exact release asset is fetched and its `SHA256SUMS` entry verified. Description: desktop student lab client with local MuJoCo SO-101 simulation and existing Blockly workflow; Robotics requires a separately managed environment; physical hardware/AWS are not implied.
- **WF03:** Reuse the existing Education API student/attempt/ProgramVersion authorization and Web runtime identity resolution. The Desktop local mock MQTT envelope is `{schemaVersion, kind, commandId, robotId, sequence, issuedAtMs, expiresAtMs, payload:{runId,robotId,programVersionId,profile:"lesson",program}}`. Desktop validates inner/outer robot identity and allowlisted bounded programs. Lifecycle is accepted/rejected ACK → executing → completed/failed; event IDs, sequence, timestamps, duplicate behavior, cancellation, timeout and failure are covered in local tests. Mock MQTT uses an injected authorizer and cannot reach AWS. `MOCK_RUNTIME`/`SIMULATION` never means `PHYSICAL_ROBOT`; hardware remains off.
- **WF04:** Desktop manifest is `vista.robot.recording.v1` with episode/experiment/robot identity, timestamps, local trajectory size/hash and six-joint frames. It lacks commandId, attemptId, ProgramVersion and submissionId. Desktop has no recording upload. The reviewed Web server creates `vista.experiment.telemetry.v1` from server-owned runtime snapshots, stores private S3/RustFS objects with size/hash/scope verification, then serves authorized short-lived downloads to students/teachers. Instructor review cannot consume an unuploaded Desktop episode. Claude must define and accept the server association/ingest path before Desktop upload is added.
- **AWS:** Prior handoff references Education API `https://api.skynex.best/api/v1` and Twin path `/ws/twin`; the host/deployment was not independently confirmed from available Web source. Runtime-map/private R1 and `VISTA_RUNTIME_TOKEN` are Web/backend-owned. AWS IoT mTLS certificates are operator-provisioned; Desktop did not provision certificates or enable Production MQTT. MQTT Thing Shadow/will and command topic were exercised only with fakes/local contract tests. No AWS simulation E2E or S3/SQS processing was run from Desktop. Confirm actual sandbox endpoints, least-privilege roles/bucket/prefix, queue/worker, test student/experiment, certificate rotation/revocation, retention, and teacher retrieval before cloud acceptance.

### Remaining external acceptance

- Physical robot commissioning, physical calibration, physical teleoperation and hardware safety/E-stop acceptance: **BLOCKED / NOT RUN**.
- Authorized AWS simulation E2E, Web student assignment-to-Desktop run integration, and instructor evidence review: **BLOCKED / NOT RUN** for the Desktop chain.
- Homepage deployment and anonymous download/metadata verification: **OWNER-REPORTED RELEASE COMPLETE; NOT VERIFIED from this network-isolated workspace**.

### Closure decisions

| Area | Status | Boundary |
| --- | --- | --- |
| Desktop software implementation | **DONE — scoped v0.1.0 implementation** | Local simulation/programming, safety and mock flows are evidenced above; external integration gaps remain. |
| Ubuntu distribution | **DONE — per owner release statement** | Exact public asset hash/size/tag provenance and anonymous download are not independently verified in this workspace. |
| Student Simulation Lab | **PASS — local packaged simulation** | MuJoCo and SO-101 ran with Demo authorization fixture; no real student experiment persistence is claimed. |
| Robotics mock integration | **PASS — fake/mock paths** | External environment/hardware requirements remain; no serial connection or physical calibration. |
| Physical robot acceptance | **BLOCKED / NOT RUN** | Commissioning, calibration, teleoperation and physical safety tests remain external. |
| AWS E2E | **BLOCKED / NOT RUN** | No authorized AWS simulation command, certificate, S3/SQS recording processing or live Twin session was tested from Desktop. |
| Web Education integration | **BLOCKED / PARTIAL** | Existing Web contracts are described in the handoff, but Desktop local MuJoCo experiment and evidence are not connected to a student submission/instructor review. |

Commands for the eventual owner-verified asset are the standard APT flow: `sudo apt install /tmp/vista-lab-station.deb`, launch with `gtk-launch vista-lab-station`, and remove with `sudo apt purge vista-lab-station`. The download/checksum command must use the exact verified public asset/hash, which is absent from the current local release record; do not copy a historical candidate hash into the website.

**Historical evidence below this point** contains prior candidate hashes and test states. It is retained for traceability and must not be read as the final published asset record or as release of Windows/macOS/AppImage. The final scope is Ubuntu amd64 only.

This is an internal software acceptance record. It does not certify physical hardware, AWS production, or WF01–WF04 system acceptance.

The Desktop-side integration contracts and latest Web/AWS handoff comparison are in [Final Education Platform Integration Handoff](FINAL_EDUCATION_PLATFORM_INTEGRATION_HANDOFF_2026-11-25.md). That handoff supersedes this file's prior local-only WF03 detail; it does not upgrade local mock acceptance to Education API, AWS, or physical E2E.

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
- Local branch `release/vista-capstone-final-2026-11-25` and commit `f8507ba` were created. `gh auth status` reports the configured GitHub token as invalid, SSH config has unsafe owner/mode, and outbound GitHub DNS is unavailable, so no remote branch or PR was created. checkIk redistribution rights remain unconfirmed; do not push this commit until the owner confirms them.
- No AWS or physical hardware acceptance is certified. The merge decision is **NO-GO** until project-owner gates above are cleared.
