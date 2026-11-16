"""Rebuild, audit, and package local release candidates; never publish them."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
release = root / "release"
npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
assert npm, "Install the project development dependencies first"
subprocess.run([npm, "run", "build"], cwd=root, check=True)
manifest = json.loads((root / "dist/manifest.json").read_text(encoding="utf-8"))
package = json.loads((root / "package.json").read_text(encoding="utf-8"))
version = manifest["version"]
assert re.fullmatch(r"\d+(?:\.\d+){0,3}", version), "Invalid manifest version"
assert package["version"] == version, "Package and manifest versions differ"
release.mkdir(exist_ok=True)
private_dirs = {"tmp", "output", "node_modules", ".git", ".codex", ".agents", "__pycache__"}


def permitted(path):
    parts = Path(path).parts
    return not (private_dirs.intersection(parts)
                or any(part.startswith(".env") for part in parts)
                or Path(path).name.lower() == "plan.md"
                or Path(path).suffix.lower() in {".pdf", ".pairleaf", ".pyc"})


def collect(directory, prefix=""):
    result = []
    for item in sorted((root / directory).rglob("*")):
        relative = item.relative_to(root / directory)
        if "node_modules" in relative.parts or "dist" in relative.parts:
            continue
        assert not item.is_symlink(), f"Symlinks are not release inputs: {item}"
        if item.is_file():
            name = prefix + relative.as_posix()
            assert permitted(name), f"Private file in release inputs: {name}"
            result.append((item, name))
    return result


def audit(archive_path, expected, extension):
    with ZipFile(archive_path) as archive:
        assert archive.testzip() is None, "Corrupt ZIP"
        names = archive.namelist()
        assert len(names) == len(set(names)), "Duplicate ZIP entries"
        assert set(names) == {name for _, name in expected}, "Unexpected ZIP content"
        for source, name in expected:
            assert permitted(name), f"Private ZIP entry: {name}"
            assert archive.read(name) == source.read_bytes(), f"Changed ZIP input: {name}"
        if extension:
            packed = json.loads(archive.read("manifest.json"))
            assert packed == manifest, "Packaged manifest differs from audited build"
            assert not packed.get("host_permissions")
            assert not packed.get("optional_host_permissions")
            assert "connect-src 'self';" in packed["content_security_policy"]["extension_pages"]
            assert not any("ocr-assets" in name or "traineddata" in name for name in names)

source_files = [".gitignore", "package.json", "package-lock.json", "tsconfig.json",
                "vite.config.ts", "index.html", "README.md", "RESULTS.md",
                "PRIVACY.md", "CHANGELOG.md", "THIRD_PARTY_NOTICES.txt"]
source_dirs = ["src", "public", "tests", "scripts", "server", "experiments", "docs", "site", "store"]
source_entries = [(root / name, "paired-pdf-extension/" + name) for name in source_files]
for directory in source_dirs:
    source_entries.extend(collect(directory, "paired-pdf-extension/" + directory + "/"))

candidates = [
    (f"Pairleaf-{version}.zip", collect("dist"), True),
    (f"Pairleaf-{version}-source.zip", source_entries, False),
]
temporary = []
try:
    for filename, entries, extension in candidates:
        target = release / (filename + ".tmp")
        temporary.append((target, release / filename))
        with ZipFile(target, "w", ZIP_DEFLATED) as archive:
            for source, name in entries:
                archive.write(source, name)
        audit(target, entries, extension)
    # Replace old candidates only after both new archives have passed verification.
    for target, final in temporary:
        target.replace(final)
        print(f"{final.name}: {final.stat().st_size:,} bytes; rebuilt and verified")
finally:
    for target, _ in temporary:
        target.unlink(missing_ok=True)
