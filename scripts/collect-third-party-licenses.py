#!/usr/bin/env python3
"""Collect available license/notice files from native build and package trees."""
from __future__ import annotations

import hashlib
import re
import sys
import sysconfig
import zipfile
from pathlib import Path

LICENSE_NAME = re.compile(r"^(licenses?|licences?|copying|notices?|patents|copyright)(?:[._ -].*)?$", re.I)
MAX_FILE_SIZE = 20 * 1024 * 1024


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: collect-third-party-licenses.py OUTPUT.zip")
    output = Path(sys.argv[1])
    roots = [
        ("npm-build", Path("node_modules")),
        ("python-build", Path(sysconfig.get_paths()["purelib"])),
        ("python-platform", Path(sysconfig.get_paths()["platlib"])),
        ("desktop-package", Path("dist/phase6-candidate")),
    ]
    entries: list[tuple[str, Path, bytes, str]] = []
    seen_content: dict[str, str] = {}
    seen_roots: set[Path] = set()
    for label, root in roots:
        try:
            identity = root.resolve()
        except OSError:
            continue
        if identity in seen_roots or not root.exists():
            continue
        seen_roots.add(identity)
        for path in root.rglob("*"):
            if not path.is_file() or path.is_symlink() or not LICENSE_NAME.match(path.name):
                continue
            try:
                if path.stat().st_size > MAX_FILE_SIZE:
                    continue
                data = path.read_bytes()
                data.decode("utf-8", errors="strict")
            except (OSError, UnicodeDecodeError):
                continue
            digest = hashlib.sha256(data).hexdigest()
            relative = f"{label}/{path.relative_to(root).as_posix()}"
            prior = seen_content.get(digest)
            if prior:
                entries.append((relative, path, data, f"duplicate-content-of={prior}"))
            else:
                seen_content[digest] = relative
                entries.append((relative, path, data, digest))
    entries.sort(key=lambda item: item[0].casefold())
    if not entries:
        raise SystemExit("No third-party license or notice files were found; refusing to create an empty archive.")

    output.parent.mkdir(parents=True, exist_ok=True)
    index = [
        "VISTA Lab Station native build license/notice file collection",
        "Collected by path from node_modules, Python site-packages and electron-builder output.",
        "Build trees can contain extra build-tool notices; this archive is intentionally inclusive.",
        "See THIRD_PARTY_NOTICES.md and the per-platform CycloneDX SBOM for component/license inventory.",
        "",
        "File path | SHA-256 | Notes",
        "--- | --- | ---",
    ]
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for relative, _path, data, evidence in entries:
            archive.writestr(relative, data)
            digest = hashlib.sha256(data).hexdigest()
            index.append(f"`{relative}` | `{digest}` | {evidence if evidence.startswith('duplicate-') else 'license/notice text'}")
        archive.writestr("INDEX.md", "\n".join(index) + "\n")
    print(f"Collected {len(entries)} license/notice files into {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
