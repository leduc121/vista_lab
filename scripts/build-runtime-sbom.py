#!/usr/bin/env python3
"""Convert a native runner's resolved pip inventory into CycloneDX."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import quote
from packaging.requirements import Requirement
from packaging.version import Version


def norm(value: str) -> str:
    return re.sub(r"[-_.]+", "-", value).lower()


def ref(name: str, version: str) -> str:
    return f"pkg:pypi/{quote(norm(name), safe='-._~')}@{quote(version, safe='-._~')}"


def main() -> int:
    if len(sys.argv) != 4:
        raise SystemExit("usage: build-runtime-sbom.py PIP_INSPECT_JSON OUTPUT.json PLATFORM")
    inspect_path, output_path = map(Path, sys.argv[1:3])
    platform = sys.argv[3]
    application_version = json.loads(
        (Path(__file__).resolve().parents[1] / "package.json").read_text(encoding="utf-8")
    )["version"]
    inventory = json.loads(inspect_path.read_text(encoding="utf-8"))
    packages = inventory.get("installed", [])
    components = []
    refs = {}
    installed_by_name = {}
    for item in packages:
        metadata = item.get("metadata", {})
        name = metadata.get("name")
        version = metadata.get("version")
        if not name or not version:
            continue
        bom_ref = ref(name, version)
        refs[(norm(name), version)] = bom_ref
        installed_by_name.setdefault(norm(name), []).append((version, bom_ref))
        raw_license = (metadata.get("license") or "").strip()
        license_name = raw_license if raw_license and raw_license.lower() not in {"unknown", "none"} else "NOASSERTION"
        components.append({
            "type": "library",
            "bom-ref": bom_ref,
            "name": name,
            "version": version,
            "purl": bom_ref,
            "scope": "required",
            "licenses": [{"license": {"name": license_name}}],
            "properties": [{"name": "pip.requested", "value": str(bool(item.get("requested"))).lower()}],
        })

    application_ref = f"pkg:generic/vista-lab-station-native-python-runtime@{application_version}"
    dependencies = [{"ref": application_ref, "dependsOn": sorted(
        refs[(norm(item.get("metadata", {}).get("name", "")), item.get("metadata", {}).get("version", ""))]
        for item in packages
        if item.get("requested") is True
        and (norm(item.get("metadata", {}).get("name", "")), item.get("metadata", {}).get("version", "")) in refs
    )}]
    for item in packages:
        metadata = item.get("metadata", {})
        name, version = metadata.get("name"), metadata.get("version")
        parent = refs.get((norm(name), version)) if name and version else None
        if not parent:
            continue
        children = set()
        requested_extras = item.get("requested_extras", [])
        for raw_requirement in metadata.get("requires_dist", []) or []:
            try:
                requirement = Requirement(raw_requirement)
                extras = requested_extras or [""]
                if requirement.marker and not any(requirement.marker.evaluate({"extra": extra}) for extra in extras):
                    continue
            except Exception as error:
                raise ValueError(f"Cannot parse dependency metadata for {name} {version}: {raw_requirement}") from error
            candidates = installed_by_name.get(norm(requirement.name), [])
            matches = [(candidate_version, candidate_ref) for candidate_version, candidate_ref in candidates
                       if not requirement.specifier or Version(candidate_version) in requirement.specifier]
            if matches:
                children.update(candidate_ref for _, candidate_ref in matches)
            else:
                raise ValueError(f"Resolved requirement missing from pip inspect inventory: {name} {version} requires {raw_requirement}")
        dependencies.append({"ref": parent, "dependsOn": sorted(children)})

    bom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.6",
        "version": 1,
        "metadata": {
            "component": {"type": "application", "bom-ref": application_ref, "name": "VISTA Lab Station native Python build environment", "version": application_version},
            "properties": [
                {"name": "inventory.status", "value": "resolved native pip package inventory with Requires-Dist dependency edges; includes PyInstaller build tools and can include packages not present in the frozen runtime; use the separate artifact scan for packaged contents"},
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
