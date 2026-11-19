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
        self.temp = tempfile.TemporaryDirectory(prefix="portable-release-test-")
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
                release_builder.HELPER + "release-notice.cjs": b"/* stale notice */\n",
                release_builder.HELPER + "release-reminder.cjs": b"/* stale reminder */\n",
            },
            main_js=b"app.setName('dsh-pet-electron-helper');\n",
        )
        out_dir = self.dir / "out"
        archive = release_builder.build_formal_release(
            base_zip, base_sha, "v1.0.7", out_dir, formal=False, run_prechecks=False
        )
        with zipfile.ZipFile(archive) as zf:
            names = set(zf.namelist())
            prefix = archive.stem + "/"
            for restricted in release_builder.RESTRICTED_ASSETS:
                self.assertNotIn(prefix + restricted, names)
            main_text = zf.read(prefix + release_builder.HELPER + "main.js").decode("utf-8")
            self.assertEqual(len(reminder_builder.REMINDER_START_RE.findall(main_text)), 1)
            self.assertNotIn(prefix + release_builder.HELPER + "release-reminder.cjs", names)
            self.assertNotIn(prefix + release_builder.HELPER + "release-notice.cjs", names)
            self.assertIn(prefix + release_builder.HELPER + "release-reminder.js", names)
            self.assertIn(prefix + release_builder.HELPER + "release-notice.js", names)
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
            base_zip, base_sha, "v1.0.7", self.dir / "out-case", formal=False, run_prechecks=False
        )
        with zipfile.ZipFile(archive) as zf:
            prefix = archive.stem + "/"
            self.assertNotIn(prefix + release_builder.HELPER + "DeepSeek-Bust.PNG", set(zf.namelist()))

    def test_wire_reminder_covers_boot_injection_and_stale_cjs_cleanup(self):
        helper = release_builder.HELPER
        # Branch 1: main.js without reminder and without trailing newline/semicolon
        raw_main = b"app.setName('dsh-pet-electron-helper')"
        out_main, out_base, out_changes, ext = release_builder.wire_reminder(raw_main, {}, {})
        self.assertEqual(ext, "cjs")
        self.assertIn(helper + "release-reminder.cjs", out_changes)
        self.assertIn(helper + "release-notice.cjs", out_changes)
        self.assertTrue(out_main.startswith(raw_main + b"\n;\n"))
        self.assertEqual(len(reminder_builder.REMINDER_START_RE.findall(out_main.decode("utf-8"))), 1)

        # Branch 1b: main.js ending with newline needs no extra separator
        nl_main = b"app.setName('dsh-pet-electron-helper');\n"
        out_main_nl, _, _, ext_nl = release_builder.wire_reminder(nl_main, {}, {})
        self.assertEqual(ext_nl, "cjs")
        self.assertTrue(out_main_nl.startswith(nl_main + reminder_builder.BOOT.encode("utf-8")[:16]))

        # Branch 2: main.js already requiring .js removes stale .cjs from base_entries
        js_main = b"const r = require('./release-reminder.js');\n"
        base_with_stale = {
            helper + "release-notice.cjs": object(),
            helper + "release-reminder.cjs": object(),
            helper + "other.js": object(),
        }
        out_main2, out_base2, out_changes2, ext2 = release_builder.wire_reminder(js_main, base_with_stale, {})
        self.assertEqual(ext2, "js")
        self.assertEqual(out_main2, js_main)
        self.assertNotIn(helper + "release-notice.cjs", out_base2)
        self.assertNotIn(helper + "release-reminder.cjs", out_base2)
        self.assertIn(helper + "other.js", out_base2)
        self.assertEqual(out_changes2, {})

        # Branch 2b: main.js requiring .cjs (even with comment mentioning .js) preserves .cjs
        cjs_main = b"// replaces release-reminder.js\nconst r = require('./release-reminder.cjs');\n"
        _, out_base3, _, ext3 = release_builder.wire_reminder(cjs_main, base_with_stale, {})
        self.assertEqual(ext3, "cjs")
        self.assertIn(helper + "release-reminder.cjs", out_base3)

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
                base_zip, base_sha, "v9.9.9", out_dir, release_name=True, run_prechecks=False
            )
        pkg_tag = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["releaseTag"]
        first = release_builder.build_formal_release(
            base_zip, base_sha, pkg_tag, out_dir, release_name=True, run_prechecks=False
        )
        self.assertTrue(first.is_file())
        with self.assertRaises(FileExistsError):
            release_builder.build_formal_release(
                base_zip, base_sha, pkg_tag, out_dir, release_name=True, force=False, run_prechecks=False
            )
        second = release_builder.build_formal_release(
            base_zip, base_sha, pkg_tag, out_dir, release_name=True, force=True, run_prechecks=False
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

    def test_verify_github_release_portable_dir_checks_sums_and_rejects_bom(self):
        sums_writer = SourceFileLoader(
            "write_sha256sums",
            str(ROOT / "scripts/write-sha256sums.py"),
        ).load_module()
        verifier = SourceFileLoader(
            "verify_github_release",
            str(ROOT / "scripts/verify-github-release.py"),
        ).load_module()
        asset = self.dir / "DeepSeekActionPet-v1.0.7-win-x64.zip"
        asset.write_bytes(b"zip-payload")
        sums_path = self.dir / "SHA256SUMS.txt"
        sums_writer.write_sha256sums(sums_path, [asset], base_dir=self.dir)
        expected = verifier.build_expected_from_portable_dir(self.dir)
        self.assertEqual(set(expected.keys()), {"SHA256SUMS.txt", asset.name})
        self.assertEqual(expected[asset.name]["size"], len(b"zip-payload"))
        sums_path.write_bytes(b"\xef\xbb\xbf" + sums_path.read_bytes())
        with self.assertRaises(ValueError):
            verifier.build_expected_from_portable_dir(self.dir)


if __name__ == "__main__":
    unittest.main()
