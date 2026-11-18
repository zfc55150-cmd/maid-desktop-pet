"""Build a reproducible formal or candidate DeepSeek portable release ZIP from a verified baseline ZIP and current source."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

from importlib.machinery import SourceFileLoader

ROOT = Path(__file__).resolve().parents[1]
base_builder = SourceFileLoader("portable_builder", str(ROOT / "scripts/build-deepseek-portable-reminder.py")).load_module()
HELPER = "node_modules/dsh-pet/runtime/electron-helper/"
RESTRICTED_ASSETS = {
    HELPER + "deepseek-bust.png",
    HELPER + "deepseek-bust-press.mp3",
    HELPER + "deepseek-bust-release.mp3",
    HELPER + "deepseek-bust-NOTICE.txt",
}


def build_formal_release(base_zip: Path, base_sha256: str, tag: str, output_dir: Path, formal: bool = False, release_name: bool = False) -> Path:
    if formal:
        checked = subprocess.run(["node", str(ROOT / "scripts/tagged-release.cjs"), tag],
                                 cwd=ROOT, capture_output=True, text=True, check=True)
        if checked.stdout.strip() != tag:
            raise ValueError("Formal tag verification mismatch")
    elif not re.fullmatch(base_builder.TAG, tag):
        raise ValueError("Invalid release tag format (expected vX.Y.Z)")

    m = re.fullmatch(rf"DeepSeekActionPet-({base_builder.TAG})-win-x64\.zip", base_zip.name)
    if not m or base_builder.version(tag) <= base_builder.version(m[1]):
        raise ValueError("Use a clean DeepSeek x64 release ZIP and a newer vX.Y.Z tag")
    if not re.fullmatch(r"[a-f0-9]{64}", base_sha256.lower()) or base_builder.sha256(base_zip) != base_sha256.lower():
        raise ValueError("Base ZIP SHA-256 does not match")

    subprocess.run(["node", str(ROOT / "scripts/sync-shared.cjs")], cwd=ROOT, check=True)
    subprocess.run(["node", str(ROOT / "scripts/verify.cjs")], cwd=ROOT, check=True)

    deployment = json.loads((ROOT / "deployment.json").read_text(encoding="utf-8"))
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    if deployment.get("version") != pkg.get("version"):
        raise ValueError("deployment.json and package.json version mismatch")

    archive_stem = f"DeepSeekActionPet-{tag}-win-x64" if (formal or release_name) else f"DeepSeekActionPet-candidate-{tag}-win-x64"
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / (archive_stem + ".zip")

    changes = {}
    for item in deployment["files"]:
        target_rel = item["target"].replace("\\", "/")
        if target_rel in RESTRICTED_ASSETS:
            continue
        src_path = ROOT / item["source"]
        data = src_path.read_bytes()
        if hashlib.sha256(data).hexdigest().lower() != item["sha256"].lower():
            raise ValueError("Source SHA-256 mismatch: " + item["source"])
        changes[target_rel] = data

    changes["portable/first-run.cjs"] = (ROOT / "integrations/deepseek-portable/first-run.cjs").read_bytes()
    changes["portable/stop.ps1"] = (ROOT / "integrations/deepseek-portable/stop.ps1").read_bytes()
    changes[HELPER + "release-notice.cjs"] = (ROOT / "integrations/gpt-niang/product-electron/services/release-notice.cjs").read_bytes()
    changes[HELPER + "release-reminder.cjs"] = (ROOT / "integrations/deepseek-portable/release-reminder.cjs").read_bytes()
    changes[HELPER + "release-tag.json"] = (json.dumps({"tag": tag, "maintenanceVersion": deployment["version"]}) + "\n").encode("utf-8")

    with zipfile.ZipFile(base_zip) as source:
        entries = base_builder.safe_entries(source, base_zip.stem)
        required = {HELPER + "main.js", "PORTABLE-README.md", "launcher.mjs", "Start-DeepSeek-Niang.cmd",
                    "Stop-DeepSeek-Niang.cmd", "electron/electron.exe", "node.exe"}
        if not required.issubset(entries):
            raise ValueError("Missing required DeepSeek portable files in base ZIP")

        main_bytes = changes.get(HELPER + "main.js", source.read(entries[HELPER + "main.js"]))
        boot_bytes = base_builder.BOOT.encode("utf-8")
        if b"release-reminder.cjs" not in main_bytes:
            main_bytes = main_bytes + boot_bytes
        if b"if (process.env.DSH_HOME) app.setPath('userData'" not in main_bytes:
            anchor = b"app.setName('dsh-pet-electron-helper');"
            if main_bytes.count(anchor) != 1:
                raise ValueError("Expected unique app.setName anchor in main.js")
            main_bytes = main_bytes.replace(
                anchor,
                anchor + b"\nif (process.env.DSH_HOME) app.setPath('userData', require('node:path').join(process.env.DSH_HOME, 'electron-profile'));",
                1,
            )
        changes[HELPER + "main.js"] = main_bytes

        readme = source.read(entries["PORTABLE-README.md"]).decode("utf-8")
        if base_builder.README in readme:
            readme = readme.replace(base_builder.README, "", 1)
        elif base_builder.LEGACY_README in readme:
            readme = readme.replace(base_builder.LEGACY_README, "", 1)
        readme = re.sub(rf"(?<![\w.-]){re.escape(m[1])}(?![\w.-])", tag, readme, count=1)
        readme = readme.replace(f"**{m[1][1:]}**", f"**{tag[1:]}**", 1)
        changes["PORTABLE-README.md"] = (readme.rstrip() + "\n\n" + base_builder.README).encode("utf-8")

        expected_files = set(entries.keys()) | set(changes.keys())
        with target.open("xb") as stream:
            try:
                with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED, compresslevel=5) as dst:
                    for rel, info in entries.items():
                        if rel not in changes:
                            dst.writestr(archive_stem + "/" + rel, source.read(info))
                    for rel, data in changes.items():
                        dst.writestr(archive_stem + "/" + rel, data)
                with zipfile.ZipFile(target) as result:
                    actual = base_builder.safe_entries(result, archive_stem)
                    if (result.testzip() is not None
                            or set(actual) != expected_files
                            or not set(changes).issubset(set(actual))
                            or any(result.read(actual[rel]) != data for rel, data in changes.items())):
                        raise ValueError("Output DeepSeek release archive verification failed")
            except BaseException:
                stream.close()
                target.unlink(missing_ok=True)
                raise
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True, type=Path)
    parser.add_argument("--base-sha256", required=True)
    parser.add_argument("--tag", required=True, help="Release tag vX.Y.Z")
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--formal", action="store_true", help="Require clean git tree and matching HEAD tag")
    parser.add_argument("--release-name", action="store_true", help="Use release archive stem without requiring --formal tag check")
    args = parser.parse_args()
    out = build_formal_release(args.base, args.base_sha256, args.tag, args.out, formal=args.formal, release_name=args.release_name)
    print(json.dumps({
        "archive": str(out.resolve()),
        "sha256": base_builder.sha256(out),
        "bytes": out.stat().st_size,
        "tag": args.tag,
        "formal": args.formal,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
