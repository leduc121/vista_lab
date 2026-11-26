# VISTA Lab Station 0.1.0 — Ubuntu Release Freeze

**Historical pre-approval decision: NOT READY — RELEASE BLOCKERS REMAIN.** The owner subsequently stated that Ubuntu v0.1.0 completed its approved release process. This workspace could not refresh the public release metadata or verify which previously conflicting local DEB is published; see the newer closure record in [FINAL_ACCEPTANCE_EVIDENCE.md](FINAL_ACCEPTANCE_EVIDENCE.md). The owner statement is recorded, while public asset/tag/checksum facts remain unverified here. Product scope remains Ubuntu amd64; this file is historical evidence, not a current publication instruction.

## Freeze decision and binary identity

- Required existing Draft asset: `VISTA.Lab.Station-0.1.0-amd64.deb`, SHA-256 `a5dbca4d54a28de1aae2f254b08484460efb3db6a3eeee7828d8dc24ea3ba8e4`. The local downloaded copy matches this digest.
- That Draft DEB retains the measured SO-101 simulation gripper joint-limit overrun (`−0.188738 rad` against `−0.174533 rad`). It is not acceptable as the final Simulation candidate.
- A separate local corrected candidate exists at `dist/phase6-candidate/VISTA Lab Station-0.1.0-amd64.deb`, SHA-256 `8eb5d74c23a3be4d2164f7e58bbbb0938467240cead40eabc328e846a29309b4`. It passed targeted MuJoCo and Electron simulation checks, but is not built from an owner-reviewed/merged source revision, has no refreshed binary SBOM/license archive, and is not in the Draft.
- Source changes that affect the candidate are present in the workspace but uncommitted. A focused PR was not created: GitHub CLI authentication is invalid and the GitHub API is unreachable in this environment. No merge occurred.
- Do not substitute the local candidate or the old Draft hash for a final owner-approved artifact. After owner review/merge, build one Ubuntu amd64 DEB from that approved revision, regenerate its binary SBOM/checksums, reconcile dependency/license evidence, and repeat package acceptance. Refresh the existing Draft only after explicit owner approval. Do not create another Release.

## Final blocker classification

| Priority | Finding | Decision |
| --- | --- | --- |
| P0 | No unresolved P0 defect found in reviewed results. Safety tests pass locally; hardware output remains disabled. | No P0 release blocker identified. |
| P1 | Required Draft DEB retains the simulated gripper joint-limit defect; corrected workspace build is not reviewed or in Draft. | **BLOCKER.** Replace only after source review/merge and exact-hash verification. |
| P1 | Simulation Blockly execution does not feed the student recording workflow; no command/experiment/submission-bound recording or upload evidence exists for that journey. | **BLOCKER** if recording/evidence remains an advertised registered v0.1.0 lab capability. Do not waive; owner must supply the scoped fix or remove/clarify that registered requirement before release. |
| P1 | Clean install/menu/uninstall on isolated Ubuntu was not run. No observed package install failure. | Owner Ubuntu acceptance remains required; this is unverified, not a demonstrated defect. |
| P2 | App UI contains mixed Vietnamese and English; Robotics Profile requires an external environment; Cartesian frame offset is documented; real Education API/AWS and physical sessions are absent. | Keep documented; no scope expansion under freeze. |
| P3 | Cosmetic issues. | No release work. |

The P1 recording status is documented in the [Robotics Lab Acceptance](ROBOTICS_LAB_FINAL_ACCEPTANCE_2026-11-25.md), [Student Lab Acceptance](STUDENT_LAB_ACCEPTANCE_2026-11-25.md), and [Education Platform Integration Handoff](FINAL_EDUCATION_PLATFORM_INTEGRATION_HANDOFF_2026-11-25.md). If student evidence is mandatory in the registered scope, this release cannot be approved with the current implementation.

## Final regression evidence

- `edge/.venv/bin/python -m unittest discover -s edge/tests -v`: **88 passed** (runtime, MuJoCo, CheckIK, safety, teleoperation, fake MQTT, local WF03, calibration, mock LeRobot).
- `npm test`: **25 API/IPC/security contract checks and 18 Node runtime/recording tests passed**.
- `npm run typecheck`: passed JavaScript syntax checks; repository has no TypeScript sources/compiler.
- `npm run build:renderer`: passed.
- Packaged extracted-DEB Electron smoke on Ubuntu 26.04.1: **PASS** Demo lab/workspace, MuJoCo simulation result, runtime readiness, locked physical output, graceful process exit. This exercises the local corrected candidate, not the Draft DEB or a clean install.
- Actual screenshots from that run: [`final-freeze-mujoco-electron.png`](evidence/final-freeze-mujoco-electron.png) and [`final-freeze-runtime-profile-electron.png`](evidence/final-freeze-runtime-profile-electron.png).
- Safety and recording contract tests passed for their documented local/mock paths. They do not establish simulation recording association or physical acceptance.
- `desktop-file-validate`, DEB metadata and archive inspection passed for the local corrected candidate. `git diff --check` passed.
- A clean APT install, menu launch, uninstall/reinstall, and clean-image dependency resolution were not run. The sandbox's Docker daemon was inaccessible; owner-host privileged installation was not attempted.

## Release gates

| Gate | Status |
| --- | --- |
| Student Simulation journey | **PASS — Demo/local runtime scope** |
| Programming execution contract | **PASS — targeted local/mock contracts** |
| Robotics fake/mock acceptance | **PASS — mock only; external requirements documented** |
| Shared Safety Controller | **PASS — local and mock tests; no physical safety certification** |
| Recording/replay | **PARTIAL — local schema/integrity/replay contracts pass; Simulation run association/upload is a P1 blocker** |
| Local integration contract | **PASS — mock services and simulated execution only** |
| Ubuntu package | **PARTIAL — local corrected DEB metadata/payload/runtime pass; required Draft differs and clean install is unverified** |
| License/SBOM | **PARTIAL — existing SBOM/reconciliation are scoped to the old Draft hash; regenerate for corrected final DEB after approval. Preserve all `NOASSERTION` entries.** |
| Owner Ubuntu acceptance | **PENDING** |
| Focused PR and owner review | **BLOCKED — GitHub token invalid/API unreachable; local source changes remain uncommitted** |
| PR merge | **NOT DONE** |
| Draft asset integrity | **Local saved copy matches stated old Draft SHA; no fresh remote fetch this turn. Draft remains the defective artifact.** |
| Physical robot | **BLOCKED / NOT RUN** — no device, calibration, commissioning, or motion |
| AWS E2E | **BLOCKED / NOT RUN** — no AWS resources, Production credentials, or command dispatch |

## Required release sequence

1. Restore authorized GitHub access and create a focused PR for the simulation fix and runtime contract changes; request owner review. Do not merge automatically.
2. Resolve the recording/evidence P1 requirement in the registered scope. If required, the supported Simulation journey needs recording data associated with the authorized command/experiment/submission and a verified upload path; the current mock contract is insufficient.
3. After owner review and merge, build exactly one Ubuntu amd64 DEB. Regenerate binary SBOM and checksums, reconcile the actual bundled dependency tree and license notices, and preserve `NOASSERTION` where evidence is absent.
4. Repeat exact-hash package, clean-install, launcher, Simulation, recording, safety and uninstall checks in an isolated supported Ubuntu environment.
5. Present the concrete artifact and evidence to the owner. Refresh the existing Draft only with explicit approval. Do not merge further changes or publish without owner approval.
