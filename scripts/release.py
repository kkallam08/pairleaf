"""Package an explicit allowlist. Never include validation PDFs, caches or screenshots."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
release = root / "release"
release.mkdir(exist_ok=True)
assert (root / "dist" / "manifest.json").is_file(), "Run npm run build first"

with ZipFile(release / "Pairleaf-0.1.0.zip", "w", ZIP_DEFLATED) as archive:
    for item in sorted((root / "dist").rglob("*")):
        if item.is_file():
            assert item.suffix.lower() != ".pdf"
            archive.write(item, item.relative_to(root / "dist"))

source_files = [".gitignore", "package.json", "package-lock.json", "tsconfig.json",
                "vite.config.ts", "index.html", "README.md", "RESULTS.md",
                "THIRD_PARTY_NOTICES.txt"]
source_dirs = ["src", "public", "tests", "scripts"]
with ZipFile(release / "Pairleaf-0.1.0-source.zip", "w", ZIP_DEFLATED) as archive:
    for name in source_files:
        archive.write(root / name, "paired-pdf-extension/" + name)
    for directory in source_dirs:
        for item in sorted((root / directory).rglob("*")):
            if item.is_file():
                assert item.suffix.lower() != ".pdf"
                assert "__pycache__" not in item.parts
                archive.write(item, "paired-pdf-extension/" + item.relative_to(root).as_posix())

for filename in ("Pairleaf-0.1.0.zip", "Pairleaf-0.1.0-source.zip"):
    with ZipFile(release / filename) as archive:
        assert archive.testzip() is None
        assert not any(name.endswith(".pdf") or any(part in name.split("/") for part in ("tmp", "output", "node_modules")) for name in archive.namelist())
        print(f"{filename}: {len(archive.namelist())} files, {(release / filename).stat().st_size:,} bytes; archive verified")
