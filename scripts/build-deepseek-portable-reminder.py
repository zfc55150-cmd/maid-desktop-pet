"""Add the portable-only reminder to a verified, clean DeepSeek release ZIP."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TAG = r"v(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})"
HELPER = "node_modules/dsh-pet/runtime/electron-helper/"
BOOT = """

// Portable distribution only: the installed helper never loads this module.
if (process.env.DSH_PET_DPI_PROBE !== '1' && process.env.DSH_PET_SMOKE !== '1' && process.env.DSH_HOME) {
  app.whenReady().then(() => require('./release-reminder.cjs').start({
    electron: electronApi,
    localTag: require('./release-tag.json').tag,
    stateDir: process.env.DSH_HOME,
    getPetWindow: () => [...windows.values()].find(pet => !pet.isDestroyed() && pet.isVisible())
  })).catch(() => {});
}
"""
README = """## 新版本提醒 / Release reminders

便携版启动后约 30 秒检查 GitHub，持续运行时也会检查，正常情况下每 24 小时最多查询一次。
只有发布了新版 DeepSeek 娘 ZIP 才会提示；同一个版本只提醒一次。点「前往下载」打开对应发布页。
程序不会自动下载安装。离线时照常使用。若想关闭提醒，退出后在包内
`state/release-reminder.json` 写入 `{"enabled": false}`；删掉该设置可重新开启。

"""


def sha256(file):
    with file.open("rb") as stream:
        h = hashlib.sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
        return h.hexdigest()


def version(tag):
    return tuple(map(int, tag[1:].split(".")))


def safe_entries(archive, base):
    paths = {}
    for info in archive.infolist():
        name = info.filename
        if not name.startswith(base + "/") or "\\" in name or ":" in name:
            raise ValueError("ZIP entry outside the package root")
        relative = name[len(base) + 1:].rstrip("/")
        parts = PurePosixPath(relative).parts
        if relative and any(not p or p in (".", "..") or p.endswith((" ", ".")) for p in relative.split("/")):
            raise ValueError("Invalid ZIP entry")
        if info.is_dir():
            continue
        if (not parts or parts[0].casefold() in {"state", "backups", "work", "dist"}
                or any(p.casefold() == ".aws" for p in parts)
                or re.fullmatch(r"(?:\.env(?:\..*)?|chat\.json.*|main-config\.jsonc.*|api_credentials\.json|control-session\.json|.+\.(?:log|pem|pfx|key))",
                                parts[-1], re.IGNORECASE)):
            raise ValueError("ZIP contains personal state or a protected file type")
        key = relative.casefold()
        if key in paths or (info.external_attr >> 16) & 0o170000 == 0o120000:
            raise ValueError("Duplicate or linked ZIP entry")
        paths[key] = info
    return {info.filename[len(base) + 1:]: info for info in paths.values()}


def build(base, expected_sha, tag, output_dir):
    m = re.fullmatch(rf"DeepSeekActionPet-({TAG})-win-x64\.zip", base.name)
    if not m or not re.fullmatch(TAG, tag) or version(tag) <= version(m[1]):
        raise ValueError("Use a clean DeepSeek x64 release ZIP and a newer vX.Y.Z tag")
    if not re.fullmatch(r"[a-f0-9]{64}", expected_sha) or sha256(base) != expected_sha:
        raise ValueError("Base ZIP SHA-256 does not match")

    name = f"DeepSeekActionPet-{tag}-win-x64"
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / (name + ".zip")
    module = ROOT / "integrations/deepseek-portable/release-reminder.cjs"
    common = ROOT / "integrations/gpt-niang/product-electron/services/release-notice.cjs"
    added = {HELPER + module.name: module.read_bytes(), HELPER + common.name: common.read_bytes(),
             HELPER + "release-tag.json": (json.dumps({"tag": tag}) + "\n").encode("utf-8")}
    with zipfile.ZipFile(base) as source:
        entries = safe_entries(source, base.stem)
        required = {HELPER + "main.js", "PORTABLE-README.md", "launcher.mjs", "Start-DeepSeek-Niang.cmd",
                    "Stop-DeepSeek-Niang.cmd", "electron/electron.exe", "node.exe"}
        if not required.issubset(entries):
            raise ValueError("Missing required DeepSeek portable files")
        existing = {rel.casefold() for rel in entries}
        prior = set(rel for rel in added if rel.casefold() in existing)
        if prior and (prior != added.keys() or
                      json.loads(source.read(entries[HELPER + "release-tag.json"])) != {"tag": m[1]}):
            raise ValueError("Base reminder metadata is incomplete or inconsistent")
        main = source.read(entries[HELPER + "main.js"])
        boot = BOOT.encode("utf-8")
        if (prior and not main.endswith(boot)) or (not prior and (b"release-reminder.cjs" in main or
                b"const windows = new Map" not in main or b"const { app, BrowserWindow" not in main)):
            raise ValueError("Base helper does not have the expected portable entry point")
        readme = source.read(entries["PORTABLE-README.md"]).decode("utf-8")
        if prior:
            if README not in readme:
                raise ValueError("Base README is missing the reminder instructions")
            readme = readme.replace(README, "", 1)
        readme = readme.replace(m[1], tag).replace(f"**{m[1][1:]}**", f"**{tag[1:]}**")
        changed = {HELPER + "main.js": main if prior else main + boot,
                   "PORTABLE-README.md": (readme.rstrip() + "\n\n" + README).encode("utf-8")}
        expected_crcs = {rel: info.CRC for rel, info in entries.items() if rel not in changed and rel not in added}
        with target.open("xb") as stream:
            try:
                with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED, compresslevel=5) as result:
                    for rel, info in entries.items():
                        if rel not in changed and rel not in added:
                            result.writestr(name + "/" + rel, source.read(info))
                    for rel, data in {**changed, **added}.items():
                        result.writestr(name + "/" + rel, data)
                with zipfile.ZipFile(target) as result:
                    actual = safe_entries(result, name)
                    if (result.testzip() is not None or set(actual) != set(entries) | set(added)
                            or any(actual[rel].CRC != crc for rel, crc in expected_crcs.items())
                            or any(result.read(actual[rel]) != data for rel, data in {**changed, **added}.items())):
                        raise ValueError("Candidate ZIP verification failed")
            except BaseException:
                stream.close()
                target.unlink()
                raise
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True, type=Path)
    parser.add_argument("--base-sha256", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    result = build(args.base, args.base_sha256.lower(), args.tag, args.out)
    print(f"{sha256(result)}  {result.resolve()}")
