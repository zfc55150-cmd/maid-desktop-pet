"""Build a reproducible formal or candidate DeepSeek portable release ZIP from a verified baseline ZIP and current source."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

from importlib.util import module_from_spec, spec_from_file_location

ROOT = Path(__file__).resolve().parents[1]


def _load_script_module(name: str, path: Path):
    spec = spec_from_file_location(name, str(path))
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module {name} from {path}")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base_builder = _load_script_module("portable_builder", ROOT / "scripts/build-deepseek-portable-reminder.py")
HELPER = "node_modules/dsh-pet/runtime/electron-helper/"
RESTRICTED_ASSETS = {
    HELPER + "deepseek-bust.png",
    HELPER + "deepseek-bust-press.mp3",
    HELPER + "deepseek-bust-release.mp3",
    HELPER + "deepseek-bust-NOTICE.txt",
}
RESTRICTED_FOLD = {item.casefold() for item in RESTRICTED_ASSETS}
REMINDER_JS_RE = re.compile(r"require\(\s*['\"]\./release-reminder(?:\.js)?['\"]\s*\)")
REMINDER_CJS_RE = re.compile(r"require\(\s*['\"]\./release-reminder\.cjs['\"]\s*\)")
COMMENT_RE = re.compile(r"//[^\r\n]*|/\*[\s\S]*?\*/")
DSH_HOME_SNIPPET = b"if (process.env.DSH_HOME) app.setPath('userData', require('node:path').join(process.env.DSH_HOME, 'electron-profile'));"


def _strip_js_comments(text: str) -> str:
    return COMMENT_RE.sub("", text)


def wire_reminder(main_bytes: bytes, base_entries: dict, changes: dict) -> tuple[bytes, dict, dict, str]:
    """Ensure exactly one release reminder hook is wired and clean stale .cjs copies when .js is active."""
    main_text = main_bytes.decode("utf-8")
    code_text = _strip_js_comments(main_text)
    updated_base = dict(base_entries)
    updated_changes = dict(changes)
    if not base_builder.REMINDER_START_RE.search(code_text):
        updated_changes[HELPER + "release-notice.cjs"] = (
            ROOT / "integrations/gpt-niang/product-electron/services/release-notice.cjs"
        ).read_bytes()
        updated_changes[HELPER + "release-reminder.cjs"] = (
            ROOT / "integrations/deepseek-portable/release-reminder.cjs"
        ).read_bytes()
        separator = b"" if main_bytes.endswith((b"\n", b"\r", b";")) else b"\n;\n"
        main_bytes = main_bytes + separator + base_builder.BOOT.encode("utf-8")
        return main_bytes, updated_base, updated_changes, "cjs"

    if REMINDER_JS_RE.search(code_text) and not REMINDER_CJS_RE.search(code_text):
        stale_cjs = {(HELPER + "release-notice.cjs").casefold(), (HELPER + "release-reminder.cjs").casefold()}
        updated_base = {rel: info for rel, info in updated_base.items() if rel.casefold() not in stale_cjs}
        return main_bytes, updated_base, updated_changes, "js"

    return main_bytes, updated_base, updated_changes, "cjs"


def resolve_node() -> str:
    """Locate Node.js from PATH or the local DeepSeek runtime."""
    found = shutil.which("node")
    if found:
        return found
    local_app = os.environ.get("LOCALAPPDATA")
    if local_app:
        bundled = Path(local_app) / "Programs/DeepSeekActionPet/node.exe"
        if bundled.is_file():
            return str(bundled)
    return "node"


def build_formal_release(base_zip: Path, base_sha256: str, tag: str, output_dir: Path, formal: bool = False, release_name: bool = False, force: bool = False, run_prechecks: bool = True) -> Path:
    node_exe = resolve_node()
    if formal:
        checked = subprocess.run([node_exe, str(ROOT / "scripts/tagged-release.cjs"), tag],
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

    if run_prechecks:
        subprocess.run([node_exe, str(ROOT / "scripts/sync-shared.cjs")], cwd=ROOT, check=True)
        subprocess.run([node_exe, str(ROOT / "scripts/verify.cjs")], cwd=ROOT, check=True)

    deployment = json.loads((ROOT / "deployment.json").read_text(encoding="utf-8"))
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    if deployment.get("version") != pkg.get("version"):
        raise ValueError("deployment.json and package.json version mismatch")
    if not re.fullmatch(r"\d+\.\d+\.\d+-release-notice\.\d+", str(deployment.get("version", ""))):
        raise ValueError("Invalid maintenanceVersion format in deployment.json")
    if (formal or release_name) and pkg.get("releaseTag") != tag:
        raise ValueError("package.json releaseTag does not match release tag")
    if release_name and not formal and run_prechecks:
        dirty = subprocess.run(["git", "status", "--porcelain", "--untracked-files=normal"],
                               cwd=ROOT, capture_output=True, text=True)
        if dirty.returncode == 0 and dirty.stdout.strip():
            raise ValueError("RELEASE_NAME_REQUIRES_CLEAN_TREE")

    archive_stem = f"DeepSeekActionPet-{tag}-win-x64" if (formal or release_name) else f"DeepSeekActionPet-candidate-{tag}-win-x64"
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / (archive_stem + ".zip")
    if force and target.exists():
        target.unlink()

    changes = {}
    for item in deployment["files"]:
        target_rel = item["target"].replace("\\", "/")
        if target_rel.casefold() in RESTRICTED_FOLD:
            continue
        src_path = ROOT / item["source"]
        data = src_path.read_bytes()
        if hashlib.sha256(data).hexdigest().lower() != item["sha256"].lower():
            raise ValueError("Source SHA-256 mismatch: " + item["source"])
        changes[target_rel] = data

    changes["portable/first-run.cjs"] = (ROOT / "integrations/deepseek-portable/first-run.cjs").read_bytes()
    changes["portable/stop.ps1"] = (ROOT / "integrations/deepseek-portable/stop.ps1").read_bytes()
    changes[HELPER + "release-tag.json"] = (json.dumps({"tag": tag, "maintenanceVersion": deployment["version"]}) + "\n").encode("utf-8")

    with zipfile.ZipFile(base_zip) as source:
        entries = base_builder.safe_entries(source, base_zip.stem)
        required = {HELPER + "main.js", "PORTABLE-README.md", "launcher.mjs", "Start-DeepSeek-Niang.cmd",
                    "Stop-DeepSeek-Niang.cmd", "electron/electron.exe", "node.exe"}
        if not required.issubset(entries):
            raise ValueError("Missing required DeepSeek portable files in base ZIP")

        base_entries = {rel: info for rel, info in entries.items() if rel.casefold() not in RESTRICTED_FOLD}

        # Note: deployment.json includes app/electron-helper/main.js, which overrides base_zip's main.js.
        main_bytes = changes.get(HELPER + "main.js", source.read(entries[HELPER + "main.js"]))
        main_bytes, base_entries, changes, reminder_ext = wire_reminder(main_bytes, base_entries, changes)
        if b"if (process.env.DSH_HOME) app.setPath('userData'" not in main_bytes:
            anchor = b"app.setName('dsh-pet-electron-helper');"
            if main_bytes.count(anchor) != 1:
                raise ValueError("Expected unique app.setName anchor in main.js")
            main_bytes = main_bytes.replace(
                anchor,
                anchor + b"\n" + DSH_HOME_SNIPPET,
                1,
            )
        if DSH_HOME_SNIPPET not in main_bytes:
            raise ValueError("DSH_HOME userData snippet missing from portable main.js")
        changes[HELPER + "main.js"] = main_bytes

        readme = source.read(entries["PORTABLE-README.md"]).decode("utf-8")
        if base_builder.README in readme:
            readme = readme.replace(base_builder.README, "", 1)
        elif base_builder.LEGACY_README in readme:
            readme = readme.replace(base_builder.LEGACY_README, "", 1)
        readme = re.sub(rf"(?<![\w.-]){re.escape(m[1])}(?![\w.-])", tag, readme, count=1)
        readme = readme.replace(f"**{m[1][1:]}**", f"**{tag[1:]}**", 1)
        changes["PORTABLE-README.md"] = (readme.rstrip() + "\n\n" + base_builder.README).encode("utf-8")

        if any(rel.casefold() in RESTRICTED_FOLD for rel in changes):
            raise ValueError("Restricted asset staged for release output")
        base_fold = {rel.casefold(): rel for rel in base_entries}
        for rel in changes:
            existing = base_fold.get(rel.casefold())
            if existing and existing != rel:
                raise ValueError("Case collision between base entry and change: " + rel)

        expected_files = set(base_entries.keys()) | set(changes.keys())
        with target.open("xb") as stream:
            try:
                with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED, compresslevel=5) as dst:
                    for rel, info in base_entries.items():
                        if rel not in changes:
                            dst.writestr(archive_stem + "/" + rel, source.read(info))
                    for rel, data in changes.items():
                        dst.writestr(archive_stem + "/" + rel, data)
                with zipfile.ZipFile(target) as result:
                    actual = base_builder.safe_entries(result, archive_stem)
                    actual_main = result.read(actual[HELPER + "main.js"]).decode("utf-8")
                    required_reminder = {
                        HELPER + f"release-reminder.{reminder_ext}",
                        HELPER + f"release-notice.{reminder_ext}",
                    }
                    bad_member = result.testzip()
                    if bad_member is not None:
                        raise ValueError(f"Output DeepSeek release archive failed CRC check: {bad_member}")
                    if set(actual) != expected_files:
                        diff = sorted(set(actual) ^ expected_files)
                        raise ValueError(f"Output DeepSeek release archive entries mismatch: {diff}")
                    if not set(changes).issubset(set(actual)):
                        missing = sorted(set(changes) - set(actual))
                        raise ValueError(f"Output DeepSeek release archive missing staged changes: {missing}")
                    if not required_reminder.issubset(set(actual)):
                        missing_rem = sorted(required_reminder - set(actual))
                        raise ValueError(f"Output DeepSeek release archive missing required reminder files: {missing_rem}")
                    if any(rel.casefold() in RESTRICTED_FOLD for rel in actual):
                        raise ValueError("Output DeepSeek release archive contains restricted assets")
                    wiring_count = len(base_builder.REMINDER_START_RE.findall(_strip_js_comments(actual_main)))
                    if wiring_count != 1:
                        raise ValueError(f"Output DeepSeek release archive reminder wiring count={wiring_count}, expected 1")
                    if DSH_HOME_SNIPPET.decode("utf-8") not in actual_main:
                        raise ValueError("Output DeepSeek release archive main.js missing DSH_HOME snippet")
                    for rel, data in changes.items():
                        if result.read(actual[rel]) != data:
                            raise ValueError(f"Output DeepSeek release archive content mismatch for {rel}")
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
    parser.add_argument("--force", action="store_true", help="Overwrite existing output archive if present")
    args = parser.parse_args()
    out = build_formal_release(args.base, args.base_sha256, args.tag, args.out, formal=args.formal, release_name=args.release_name, force=args.force)
    print(json.dumps({
        "archive": str(out.resolve()),
        "sha256": base_builder.sha256(out),
        "bytes": out.stat().st_size,
        "tag": args.tag,
        "formal": args.formal,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
