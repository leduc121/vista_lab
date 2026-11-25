#!/usr/bin/env python3
"""Convert pip inspect output into a small CycloneDX inventory for native CI."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import quote


def norm(value: str) -> str:
    return re.sub(r"[-_.]+", "-", value).lower()


def ref(name: str, version: str) -> str:
    return f"pkg:pypi/{quote(norm(name), safe='-._~')}@{quote(version, safe='-._~')}"


def main() -> int:
    if len(sys.argv) != 4:
        raise SystemExit("usage: build-runtime-sbom.py PIP_INSPECT_JSON OUTPUT.json PLATFORM")
    inspect_path, output_path = map(Path, sys.argv[1:3])
    platform = sys.argv[3]
    inventory = json.loads(inspect_path.read_text(encoding="utf-8"))
    packages = inventory.get("installed", [])
    components = []
    refs = {}
    for item in packages:
        metadata = item.get("metadata", {})
        name = metadata.get("name")
        version = metadata.get("version")
        if not name or not version:
            continue
        bom_ref = ref(name, version)
        refs[(norm(name), version)] = bom_ref
        raw_license = (metadata.get("license") or "").strip()
        license_name = raw_license if raw_license and raw_license.lower() not in {"unknown", "none"} else "NOASSERTION"
        components.append({
            "type": "library",
            "bom-ref": bom_ref,
            "name": name,
            "version": version,
            "purl": bom_ref,
            "scope": "optional",
            "licenses": [{"license": {"name": license_name}}],
            "properties": [{"name": "pip.requested", "value": str(bool(item.get("requested"))).lower()}],
        })

    dependencies = []
    for item in packages:
        metadata = item.get("metadata", {})
        name, version = metadata.get("name"), metadata.get("version")
        parent = refs.get((norm(name), version)) if name and version else None
        if not parent:
            continue
        children = []
        # pip inspect records package metadata, but does not resolve conditional
        # requirements into a platform-accurate edge graph. Do not invent edges.
        dependencies.append({"ref": parent, "dependsOn": children})

    bom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.6",
        "version": 1,
        "metadata": {
            "component": {"type": "application", "name": "VISTA Lab Station native Python build environment", "version": "0.1.0"},
            "properties": [
                {"name": "inventory.status", "value": "native-runner pip inspect package inventory; build environment may include tools not present in frozen runtime"},
                {"name": "inventory.platform", "value": str(platform)},
            ],
        },
        "components": components,
        "dependencies": dependencies,
    }
    Path(output_path).write_text(json.dumps(bom, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
