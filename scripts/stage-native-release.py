#!/usr/bin/env python3
"""Stage native installers and the runner's Python inventory for release CI."""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 5:
        raise SystemExit("usage: stage-native-release.py DIST_DIR STAGE_DIR PIP_INSPECT_JSON PLATFORM")
    dist, stage, pip_inspect = map(Path, sys.argv[1:4])
    platform = sys.argv[4]
    installers = sorted(file for file in dist.rglob("*") if file.is_file() and file.suffix.lower() in {".exe", ".deb", ".appimage", ".dmg"})
    if not installers:
        raise SystemExit(f"No installer files found under {dist}")
    stage.mkdir(parents=True, exist_ok=True)
    for installer in installers:
        shutil.copy2(installer, stage / installer.name)
    subprocess.run([
        sys.executable,
        str(Path(__file__).with_name("build-runtime-sbom.py")),
        str(pip_inspect),
        str(stage / "runtime-python-sbom.cdx.json"),
        str(platform),
    ], check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
