"""Tests for portable release builder asset exclusion and single reminder injection."""
import hashlib
from importlib.machinery import SourceFileLoader
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
release_builder = SourceFileLoader(
    "build_deepseek_portable_release",
    str(ROOT / "scripts/build-deepseek-portable-release.py"),
).load_module()
reminder_builder = SourceFileLoader(
    "build_deepseek_portable_reminder",
    str(ROOT / "scripts/build-deepseek-portable-reminder.py"),
).load_module()


def make_base_zip(zip_path: Path, stem: str, extra_entries: dict[str, bytes], main_js: bytes) -> str:
    entries = {
        release_builder.HELPER + "main.js": main_js,
        "PORTABLE-README.md": (
            "# DeepSeekActionPet v1.0.5\n\nVersion **1.0.5**\n"
        ).encode("utf-8"),
        "launcher.mjs": b"export function runLauncher() {}\n",
        "Start-DeepSeek-Niang.cmd": b"@echo off\r\n",
        "Stop-DeepSeek-Niang.cmd": b"@echo off\r\n",
        "electron/electron.exe": b"MZ",
        "node.exe": b"MZ",
        **extra_entries,
    }
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for rel, data in entries.items():
            zf.writestr(f"{stem}/{rel}", data)
    return hashlib.sha256(zip_path.read_bytes()).hexdigest()


class PortableReleaseBuilderTests(unittest.TestCase):
    def setUp(self):
        (ROOT / "work").mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / "work", prefix="portable-release-test-")
        self.dir = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_excludes_restricted_assets_and_avoids_double_reminder(self):
        stem = "DeepSeekActionPet-v1.0.5-win-x64"
        base_zip = self.dir / f"{stem}.zip"
        base_sha = make_base_zip(
            base_zip,
            stem,
            extra_entries={
                release_builder.HELPER + "deepseek-bust.png": b"PNG",
                release_builder.HELPER + "deepseek-bust-press.mp3": b"MP3",
                release_builder.HELPER + "deepseek-bust-release.mp3": b"MP3",
                release_builder.HELPER + "deepseek-bust-NOTICE.txt": b"NOTICE",
            },
            main_js=b"app.setName('dsh-pet-electron-helper');\n",
        )
        out_dir = self.dir / "out"
        archive = release_builder.build_formal_release(
            base_zip, base_sha, "v1.0.7", out_dir, formal=False
        )
        with zipfile.ZipFile(archive) as zf:
            names = set(zf.namelist())
            prefix = archive.stem + "/"
            for restricted in release_builder.RESTRICTED_ASSETS:
                self.assertNotIn(prefix + restricted, names)
            main_text = zf.read(prefix + release_builder.HELPER + "main.js").decode("utf-8")
            self.assertEqual(len(reminder_builder.REMINDER_START_RE.findall(main_text)), 1)
            self.assertNotIn(prefix + release_builder.HELPER + "release-reminder.cjs", names)
            tag_meta = json.loads(zf.read(prefix + release_builder.HELPER + "release-tag.json"))
            self.assertEqual(tag_meta["tag"], "v1.0.7")

    def test_excludes_case_variant_restricted_asset(self):
        stem = "DeepSeekActionPet-v1.0.5-win-x64"
        base_zip = self.dir / f"{stem}.zip"
        base_sha = make_base_zip(
            base_zip,
            stem,
            extra_entries={release_builder.HELPER + "DeepSeek-Bust.PNG": b"PNG-CASE"},
            main_js=b"app.setName('dsh-pet-electron-helper');\n",
        )
        archive = release_builder.build_formal_release(
            base_zip, base_sha, "v1.0.7", self.dir / "out-case", formal=False
        )
        with zipfile.ZipFile(archive) as zf:
            prefix = archive.stem + "/"
            self.assertNotIn(prefix + release_builder.HELPER + "DeepSeek-Bust.PNG", set(zf.namelist()))

    def test_boot_snippet_includes_get_language_and_statement_separator(self):
        self.assertIn("getLanguage:", reminder_builder.BOOT)
        self.assertIn("chatControlsRef?.getLanguage?.()", reminder_builder.BOOT)

    def test_release_name_rejects_tag_mismatch_and_force_overwrites(self):
        stem = "DeepSeekActionPet-v1.0.5-win-x64"
        base_zip = self.dir / f"{stem}.zip"
        base_sha = make_base_zip(base_zip, stem, {}, b"app.setName('dsh-pet-electron-helper');\n")
        out_dir = self.dir / "out-force"
        with self.assertRaises(ValueError):
            release_builder.build_formal_release(
                base_zip, base_sha, "v9.9.9", out_dir, release_name=True
            )
        pkg_tag = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["releaseTag"]
        first = release_builder.build_formal_release(
            base_zip, base_sha, pkg_tag, out_dir, release_name=True
        )
        self.assertTrue(first.is_file())
        with self.assertRaises(FileExistsError):
            release_builder.build_formal_release(
                base_zip, base_sha, pkg_tag, out_dir, release_name=True, force=False
            )
        second = release_builder.build_formal_release(
            base_zip, base_sha, pkg_tag, out_dir, release_name=True, force=True
        )
        self.assertEqual(first, second)

    def test_write_sha256sums_emits_no_bom(self):
        sums_writer = SourceFileLoader(
            "write_sha256sums",
            str(ROOT / "scripts/write-sha256sums.py"),
        ).load_module()
        sample = self.dir / "sample.zip"
        sample.write_bytes(b"portable-zip-bytes")
        sums_path = self.dir / "SHA256SUMS.txt"
        raw = sums_writer.write_sha256sums(sums_path, [sample], base_dir=self.dir)
        self.assertFalse(raw.startswith(b"\xef\xbb\xbf"))
        self.assertEqual(sums_path.read_bytes(), raw)
        text = raw.decode("ascii")
        self.assertIn("  sample.zip\n", text)


if __name__ == "__main__":
    unittest.main()
