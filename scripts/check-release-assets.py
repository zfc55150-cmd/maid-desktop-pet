"""Emit a per-file art/font/audio inventory. Exit nonzero on missing redistribution evidence."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path, PurePosixPath
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp", ".svg", ".ico", ".cur",
    ".mp3", ".wav", ".ogg", ".opus", ".flac", ".m4a",
    ".ttf", ".otf", ".ttc", ".woff", ".woff2", ".webm", ".mp4", ".mov",
}


def inventory(zip_path, licenses):
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            name = PurePosixPath(info.filename)
            if info.is_dir() or name.suffix.lower() not in EXTENSIONS:
                continue
            with archive.open(info) as stream:
                digest = hashlib.sha256()
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
            sha = digest.hexdigest()
            record = licenses.get(sha, {})
            status = "pending"
            if record.get("redistributable") is False:
                status = "blocked"
            elif record.get("redistributable") is True and all(record.get(k) for k in ("source", "license", "evidence")):
                status = "approved"
            yield {"file": str(name), "sha256": sha, "status": status,
                   "source": record.get("source"), "license": record.get("license"),
                   "evidence": record.get("evidence")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip_files", type=Path, nargs="+")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    licenses = json.loads((ROOT / "docs/发布素材许可.json").read_text(encoding="utf-8"))
    archives = {str(zip_path.name): list(inventory(zip_path, licenses)) for zip_path in args.zip_files}
    totals = {name: dict(Counter(row["status"] for row in rows)) for name, rows in archives.items()}
    args.report.write_text(json.dumps(archives, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(totals))
    return int(any(not rows or any(row["status"] != "approved" for row in rows) for rows in archives.values()))


if __name__ == "__main__":
    sys.exit(main())
