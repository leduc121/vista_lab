#!/usr/bin/env python3
"""Build a native, self-contained Edge Runtime for the current OS/architecture."""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "edge" / "dist" / "vista-edge-runtime"
WORK = ROOT / "edge" / "build" / "pyinstaller"


def main() -> int:
    if sys.version_info[:2] != (3, 11):
        raise SystemExit("Use Python 3.11.x for reproducible native Edge Runtime builds.")
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        raise SystemExit("Install requirements-edge.txt in the native build environment first.")
    if DIST.exists():
        shutil.rmtree(DIST)
    command = [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir",
        "--name", "vista-edge-runtime", "--distpath", str(DIST.parent),
        "--workpath", str(WORK), "--specpath", str(WORK), "--paths", str(ROOT),
        "--hidden-import", "edge.mqtt_transport",
        # MuJoCo selects its headless EGL backend dynamically from MUJOCO_GL.
        # PyInstaller cannot infer this import, and the packaged Electron app
        # sets MUJOCO_GL=egl on Linux for policy camera observations.
        "--hidden-import", "OpenGL.platform.egl",
        "--collect-all", "mujoco", "--collect-all", "serial",
        "--collect-all", "paho", str(ROOT / "edge" / "runtime.py"),
    ]
    data_separator = ";" if sys.platform == "win32" else ":"
    command[command.index(str(ROOT / "edge" / "runtime.py")):command.index(str(ROOT / "edge" / "runtime.py"))] = [
        "--add-data", f"{ROOT / 'edge' / 'checkik_kinematics' / 'so101_new_calib.urdf'}{data_separator}edge/checkik_kinematics",
        "--add-data", f"{ROOT / 'models' / 'so101'}{data_separator}models/so101",
    ]
    subprocess.run(command, cwd=ROOT, check=True)
    executable = DIST / ("vista-edge-runtime.exe" if sys.platform == "win32" else "vista-edge-runtime")
    if not executable.is_file():
        raise SystemExit(f"PyInstaller did not produce expected executable: {executable}")
    print(f"Built native Edge Runtime: {executable}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
