# Windows runtime acceptance

The current NSIS artifact is built from Linux with electron-builder/Wine. That verifies installer generation and archive integrity only; it is not Windows runtime acceptance. Use a clean disposable Windows 10/11 x64 VM and test-only API resources before declaring acceptance.

## Install and configure

1. Verify the installer checksum supplied by the release owner, then run `VISTA-Lab-Station-0.1.0-rc-windows-x64-setup.exe` as a standard user. Confirm it installs per-user and launches without elevation.
2. Before launching, configure the process environment with a disposable Education API, the matching public Supabase URL/anon key, and operator Twin WebSocket URL. Example PowerShell for the current process:

   ```powershell
   $env:VISTA_EDUCATION_API = 'https://education.staging.example.edu/api/v1'
   $env:VISTA_SUPABASE_URL = 'https://<test-project-ref>.supabase.co'
   $env:VISTA_SUPABASE_ANON_KEY = '<test-project-public-anon-key>'
   $env:VISTA_TWIN_WS_URL = 'wss://twin.staging.example.edu/ws/twin'
   ```

   Never set a service-role key, publisher secret, or physical robot credential in the Desktop environment. Prefer the operator's managed launcher/Windows account environment over storing credentials in an installer or shortcut.
3. Sign in with a test student; verify setup/recovery behavior, session restart/refresh/logout, assigned labs, Blockly save/version/submit, session expiration, Twin endpoint validation, safe disconnect, and IPC denial cases using test-owned records only.
4. Verify mandatory temporary-password change and attempt-bound Twin authorization against the isolated Education API and Twin. Keep any missing or unverified backend behavior blocked; do not substitute Demo fixtures.
5. Confirm that no control path can move a physical robot. Keep this test entirely on a simulation-only allocation.

## Runtime configuration

The installer contains no API or Supabase credentials. Public runtime values are supplied through environment variables; the Twin endpoint itself may also be saved in the app's per-user config. Student access and refresh tokens are stored only through Electron `safeStorage` when Windows OS encryption is available. If unavailable, the app does not persist a session.

Record Windows version, installer SHA-256, install/launch result, relevant non-secret logs, and each test result. Do not collect passwords, recovery codes, access tokens, refresh tokens, or Twin scope tokens in acceptance evidence.
