# Isolated integration acceptance checklist

Use only disposable students and test-owned school, assignment, attempt, and robot allocation data. Never use Production, a service-role key in Desktop, or physical motion.

## Backend readiness

- [x] Source-verified Student Temporary Password contract: `POST /auth/students/login` returns a Supabase session and `password_change_required`; restricted access permits only `PATCH /auth/students/password` with `{ currentPassword, newPassword }`, returning a replacement session. Refresh preserves restriction; old JWT rotates out.
- [x] Source-verified attempt-bound viewer-scope route and `/ws/twin` protocol; broker filters by school, attempt, and robot and closes revoked scopes with 4403.
- [ ] Isolated database bootstrap fingerprint matches its pin; local GoTrue, Education API, and Twin services start without touching Claude's shared worktree.
- [ ] Disposable standard, fresh temporary-password, and other-school accounts plus assigned symbolic task, writable attempt, allocated SO-101 simulation, and public Supabase test config are available.
- [ ] Education API calls Twin `/internal/revoke-attempt` on submission and allocation/entitlement withdrawal, with reliable retry for failure.

## Real API journey and denial cases

- [ ] Login, mandatory change, restricted-route rejection, refresh rotation, expiration, invalid credentials, wrong school, and logout pass.
- [ ] `/me`, `/me/learning`, assignment detail, attempt start/resume, deadline/submission permissions, and released results/feedback pass.
- [ ] Blockly create/update/reload/validation, immutable versions, local restore/new version, schematic terminal result, submission, and submitted-attempt write rejection pass.
- [ ] Twin connects with a fresh scope for the selected attempt; joint frames update; wrong attempt, school, robot, expired/revoked scope, and stale/disconnected states fail closed.
- [ ] Existing open Twin socket closes promptly with 4403 after submission or allocation/entitlement withdrawal; another attempt remains isolated.

## Package and release

See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for local package evidence and remaining public-release gates. The current Desktop harness has not made any real API request in this final pass because no valid isolated environment variables were supplied.
