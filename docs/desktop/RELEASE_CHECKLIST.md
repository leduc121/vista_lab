# VISTA Lab Station 0.1.0 release checklist

Status: **release candidate, not approved for public distribution**. This checklist records local evidence as of 2026-11-20; it is not a Production or physical-robot acceptance record.

## Desktop gates

- [x] Student login, restricted temporary-password transition, refresh/rotation, logout, assignments, Blockly, schematic, and attempt-bound Twin use source-verified routes; unit tests pass.
- [x] Renderer runs with Electron sandbox, context isolation, no Node integration, narrow preload/IPC, restricted navigation, and no physical motion mutation API.
- [x] Linux `basic_text` safeStorage fallback cannot persist tokens; restart persistence requires an OS-backed backend.
- [x] Previous Demo UI smoke and packaged Linux window launch passed with Electron sandbox enabled; current setup-wizard visual smoke is blocked by sandbox Crashpad `EPERM`.
- [x] AppImage, DEB, NSIS files, sizes, manifest, and SHA-256 match the staged release; packages remain unsigned/private.
- [x] Python Edge Runtime, Electron supervisor, MQTT/TLS transport seam, encrypted enrollment-key storage, setup wizard, and native CI workflow implemented in source.
- [ ] Build and inspect native Edge Runtime bundles on Ubuntu, Windows x64, macOS arm64 and macOS x64. Current machine lacks PyInstaller; CI has not run.
- [ ] Refresh all installers and checksums after native builds. Current staged `v0.1.0` installers predate Edge Runtime and do not contain it.
- [ ] Run a local MQTT broker acceptance and real OS secure-storage test. Current tests use fakes only; provisioning remains `NOT PROVISIONED`.
- [ ] Supply a redistributable SO-101 MuJoCo model, implement and validate physics mapping, then pass the full local Edge→MuJoCo→MQTT→Twin journey. No model is present and no such acceptance has run.
- [ ] Full student journey and negative authorization suite pass against an isolated real Education API, GoTrue, and Twin using disposable accounts. The guarded local database bootstrap fingerprint currently differs from its pin.
- [ ] Education API immediately revokes open Twin viewers on final submission and allocation/entitlement withdrawal; verify 4403 and cleared frames.
- [ ] Actual Windows x64 install, launch, login, and uninstall pass on Windows. NSIS structure checks on Linux do not satisfy this gate.
- [ ] DEB system install/uninstall and graphics acceptance pass on a target Ubuntu/Debian machine. Extracted payload launch passed locally.
- [ ] SO-101 GLB, URDF, and STL owner confirms redistribution terms and any required notices. See ASSET_PROVENANCE.md.
- [ ] Release owner decides signing policy, signs if required, rebuilds/rechecks hashes, and explicitly approves public release.

## Final approval sequence

1. Claude/backend owner supplies an isolated API/GoTrue/Twin stack, fixes the schema pin, and wires immediate Twin revocation. Run `npm run test:integration` only with test-owned fixtures and review the result.
2. Run target-platform acceptance, obtain asset permissions, and make any required code or package changes.
3. Rebuild all installers; refresh the private candidate; run `node scripts/validate-download-release.cjs` and `sha256sum -c SHA256SUMS` from the release directory.
4. After explicit release approval, choose a static hosting root and update release status, documentation, and Web links together. Nothing is uploaded or deployed by this checklist.
