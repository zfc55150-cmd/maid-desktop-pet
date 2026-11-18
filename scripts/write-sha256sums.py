from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def format_sha256sums(files: list[Path], base_dir: Path | None = None) -> bytes:
    lines: list[str] = []
    for item in files:
        if not item.is_file():
            raise FileNotFoundError(f"Release artifact not found: {item}")
        digest = sha256_file(item)
        name = item.relative_to(base_dir).as_posix() if base_dir else item.name
        lines.append(f"{digest}  {name}")
    payload = ("\n".join(lines) + "\n") if lines else ""
    raw = payload.encode("ascii")
    if raw.startswith(b"\xef\xbb\xbf"):
        raise ValueError("UTF-8 BOM is forbidden in SHA256SUMS.txt")
    return raw


def write_sha256sums(output: Path, files: list[Path], base_dir: Path | None = None) -> bytes:
    raw = format_sha256sums(files, base_dir=base_dir)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(raw)
    return raw


def main() -> None:
    parser = argparse.ArgumentParser(description="Write ASCII (no-BOM) SHA256SUMS.txt for release files.")
    parser.add_argument("--output", required=True, help="Output SHA256SUMS.txt path")
    parser.add_argument("--base-dir", default="", help="Optional base directory for relative names")
    parser.add_argument("files", nargs="+", help="Artifact files to hash")
    args = parser.parse_args()

    out = Path(args.output)
    base = Path(args.base_dir).resolve() if args.base_dir else None
    file_paths = [Path(f).resolve() for f in args.files]
    write_sha256sums(out, file_paths, base_dir=base)
    print(f"Wrote {out} ({len(file_paths)} entries, no BOM)")


if __name__ == "__main__":
    main()
