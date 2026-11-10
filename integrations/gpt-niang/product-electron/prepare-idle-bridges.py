"""Package the two existing turn candidates, with matching installed endpoints."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess

from imageio_ffmpeg import get_ffmpeg_exe
import numpy as np

FF = get_ffmpeg_exe()
SIZE = 384
JOIN = 9
BRIDGES = [
    ("btoabridge", "侧身转入长裙待机", "B", "A", "bridge_b_to_a", "brelaxed", "idle"),
    ("atocbridge", "长裙站姿转回正面", "A", "C", "bridge_a_to_c", "idle", "frontidle"),
]


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def decode(file):
    args = ["-c:v", "libvpx-vp9", "-threads", "2", "-i", str(file)]
    raw = subprocess.check_output([FF, "-v", "error", *args, "-f", "rawvideo", "-pix_fmt", "rgba", "-"])
    return np.frombuffer(raw, np.uint8).reshape(-1, SIZE, SIZE, 4)


def encode(file, frames, transparent):
    codec = ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-crf", "14", "-b:v", "0",
             "-deadline", "good", "-cpu-used", "4", "-auto-alt-ref", "0"] if transparent else [
                 "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart"]
    pixfmt = "rgba" if transparent else "rgb24"
    subprocess.run([FF, "-v", "error", "-n", "-f", "rawvideo", "-pix_fmt", pixfmt, "-s", f"{SIZE}x{SIZE}",
                    "-r", "30", "-i", "-", "-an", *codec, "-threads", "3", str(file)],
                   input=frames.tobytes(), check=True)


def blend(start, end, f):
    f = f * f * (3 - 2 * f)
    a, b = start.astype(np.float32), end.astype(np.float32)
    wa, wb = a[:, :, 3:4] * (1 - f), b[:, :, 3:4] * f
    alpha = wa + wb
    rgb = (a[:, :, :3] * wa + b[:, :, :3] * wb) / np.maximum(alpha, 1e-6)
    return np.round(np.concatenate((rgb, alpha), axis=2)).clip(0, 255).astype(np.uint8)


def measure(a, b):
    a, b = a.astype(np.int16), b.astype(np.int16)
    am, bm = a[:, :, 3] > 10, b[:, :, 3] > 10
    shared = am & bm
    return {
        "silhouetteIou": round(float(shared.sum() / (am | bm).sum()), 4),
        "opaqueRgbMeanError": round(float(np.abs(a[:, :, :3] - b[:, :, :3])[shared].mean()), 2),
    }


def run(installed, delivery, out):
    out.mkdir(parents=True, exist_ok=False)
    media = installed / "media"
    receipts, final = {}, {}
    for id, label, entry, exit, source, before, after in BRIDGES:
        source = delivery / source / (source + ".webm")
        a, b = decode(media / (before + ".webm"))[0], decode(media / (after + ".webm"))[0]
        raw = decode(source)
        assert len(raw) == 120
        assert all(measure(x, y)["silhouetteIou"] > .94 for x, y in [(a, raw[0]), (raw[-1], b)])
        clip = raw.copy()
        for i in range(JOIN):
            t = i / (JOIN - 1)
            clip[i] = blend(a, raw[i], t)
            clip[-1-i] = blend(b, raw[-1-i], t)
        dest = out / id
        dest.mkdir()
        video, mask = dest / (id + ".webm"), dest / (id + ".bin")
        encode(video, clip, True)
        decoded = decode(video)
        assert decoded.shape == clip.shape
        visible = decoded[:, :, :, 3] > 10
        assert np.all(visible.sum(axis=(1, 2)) > 100)
        assert not np.any(visible[:, [0, -1], :]) and not np.any(visible[:, :, [0, -1]])
        mask.write_bytes(np.packbits(visible.reshape(-1), bitorder="little").tobytes())
        receipt = {"sourceBefore": measure(a, raw[0]), "packagedBefore": measure(a, decoded[0]),
                   "sourceAfter": measure(raw[-1], b), "packagedAfter": measure(decoded[-1], b),
                   "beforeMediaSha256": sha(media / (before + ".webm")),
                   "afterMediaSha256": sha(media / (after + ".webm"))}
        for join in ("Before", "After"):
            assert receipt["packaged" + join]["silhouetteIou"] >= .985
            assert receipt["packaged" + join]["opaqueRgbMeanError"] < 6
        config = dict(id=id, label=label, frames=len(decoded), fps=30, loop=False, automatic=False,
                      sourceKind="gemini-idle-turn-matched", menuGroup="姿态与收势",
                      entryPose=entry, exitPose=exit, poseBridge=True, sourceVideoSha256=sha(source),
                      videoFile=video.name, maskFile=mask.name, videoSha256=sha(video),
                      maskSha256=sha(mask), maskBytes=mask.stat().st_size)
        review = dict(acceptedForIntegrationTrial=True, userVisualAcceptance=False,
                      sourceVideoSha256=config["sourceVideoSha256"], videoSha256=config["videoSha256"],
                      evidence=receipt)
        for name, payload in (("clip.json", config), ("review.json", review)):
            (dest / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
        receipts[id], final[id] = receipt, decoded
    segments = ["frontidle", "turnside", "brelaxed", "btoabridge", "idle", "idlesway", "idle",
                "atocbridge", "frontidle"]
    def get(name):
        return final[name] if name in final else decode(media / (name + ".webm"))
    canvas = np.concatenate([get(name) for name in segments])
    alpha = canvas[:, :, :, 3:4].astype(np.float32) / 255
    bg = np.array([43, 37, 55], dtype=np.float32)
    encode(out / "idle-roundtrip.mp4", (canvas[:, :, :, :3] * alpha + bg * (1-alpha)).round().astype(np.uint8), False)
    (out / "endpoint-report.json").write_text(json.dumps(receipts, indent=2) + "\n", encoding="utf8")
    print(json.dumps(receipts))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for arg in ("installed", "delivery", "out"):
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    run(args.installed, args.delivery, args.out)
