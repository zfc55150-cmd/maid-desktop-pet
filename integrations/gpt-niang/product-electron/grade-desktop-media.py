"""Apply the approved desktop grade to registered clips with lossless alpha and chroma."""

from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

import cv2
from imageio_ffmpeg import get_ffmpeg_exe
import numpy as np


SIZE = 384
PLANE = SIZE * SIZE
FRAME_BYTES = PLANE * 5 // 2
FFMPEG = get_ffmpeg_exe()
GRID_Y, GRID_X = np.ogrid[:SIZE, :SIZE]
SPECIAL = {"dragonflame", "fanmishap", "fanmishapreturn", "lanterninvite", "lanterninvitereturn"}


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decode(path):
    data = subprocess.check_output([
        FFMPEG, "-nostdin", "-v", "error", "-threads", "2", "-c:v", "libvpx-vp9",
        "-i", str(path), "-threads", "1", "-pix_fmt", "yuva420p", "-f", "rawvideo", "-",
    ])
    return np.frombuffer(data, dtype=np.uint8).reshape(-1, FRAME_BYTES)


def smoothstep(lo, hi, data):
    weight = np.clip((data - lo) / (hi - lo), 0, 1)
    return weight * weight * (3 - 2 * weight)


def shade(frame, clip, index):
    yuv = frame[:PLANE * 3 // 2].reshape(SIZE * 3 // 2, SIZE)
    rgb = cv2.cvtColor(yuv, cv2.COLOR_YUV2RGB_I420).astype(np.float32)
    red, green, blue = np.moveaxis(rgb, -1, 0)
    alpha = frame[-PLANE:].reshape(SIZE, SIZE)
    luma = frame[:PLANE].reshape(SIZE, SIZE)
    violet = smoothstep(3, 14, blue - green) * smoothstep(0, 13, blue - red)
    shadow = smoothstep(112, 171, luma) * (1 - smoothstep(221, 237, luma))
    eye_band = np.exp(-0.5 * (((GRID_X - 182) / 49) ** 2 + ((GRID_Y - 146) / 21) ** 2))
    eye_tone = smoothstep(40, 94, luma) * (1 - smoothstep(179, 211, luma))
    inside = smoothstep(220, 252, alpha)
    amount = (15 * shadow + 19 * eye_tone * eye_band) * violet * inside

    if clip in SPECIAL:
        # Keep the stronger grade on the face. Fade it out through the repaired fire plate.
        face = (1 - smoothstep(57, 92, abs(GRID_X - 182))) * (1 - smoothstep(25, 41, abs(GRID_Y - 145)))
        amount *= face
        if clip == "dragonflame":
            fire_distance = max(27 - index, index - 177, 0)
            amount *= smoothstep(0, 10, fire_distance)
    return np.rint(luma.astype(np.float32) - amount).astype(np.uint8).ravel()


def encode(frames, path):
    subprocess.run([
        FFMPEG, "-nostdin", "-v", "error", "-n", "-f", "rawvideo", "-pixel_format", "yuva420p",
        "-video_size", "384x384", "-framerate", "30", "-i", "-", "-an",
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-lossless", "1", "-deadline", "good",
        "-cpu-used", "6", "-threads", "2", "-auto-alt-ref", "0", "-g", "90",
        "-color_range", "tv", str(path),
    ], input=frames.tobytes(), check=True)


def make_clip(clip, source, mask, scene, target, approved, base_hash):
    if sha(source) != base_hash or base_hash != mask["videoSha256"] or scene["fps"] != 30:
        raise ValueError(f"Invalid baseline for {clip}")
    original = decode(source)
    if len(original) != scene["frames"]:
        raise ValueError(f"Unexpected frame count for {clip}")
    if approved:
        if sha(approved[0]) != approved[1]:
            raise ValueError(f"Approved clip drift for {clip}")
        shutil.copyfile(approved[0], target)
    else:
        graded = original.copy()
        for index, frame in enumerate(original):
            graded[index, :PLANE] = shade(frame, clip, index)
        encode(graded, target)
    final = decode(target)
    if original.shape != final.shape or not np.array_equal(final[:, PLANE:], original[:, PLANE:]):
        raise ValueError(f"Alpha or chroma changed for {clip}")
    if not approved and not np.array_equal(graded, final):
        raise ValueError(f"Lossless verification failed for {clip}")
    if clip == "dragonflame" and not np.array_equal(final[27:178], original[27:178]):
        raise ValueError("The repaired fire frames changed")
    delta = original[:, :PLANE].astype(np.int16) - final[:, :PLANE]
    changed = np.count_nonzero(delta)
    if not changed or delta.min() < 0 or delta.max() > 25:
        raise ValueError(f"Unexpected luma grade for {clip}")
    result = dict(clip=clip, frames=len(final), fps=30, policy="approved" if approved else
                  "effect-protected" if clip in SPECIAL else "standard", oldSha256=base_hash,
                  sha256=sha(target), bytes=target.stat().st_size,
                  alphaAndChromaExact=True, changedPixels=int(changed),
                  maxLumaDelta=int(delta.max()))
    print(f"{clip}: {len(final)} frames, {changed:,} graded pixels", flush=True)
    return result


def main():
    base, stage, pilot = map(lambda arg: Path(arg).resolve(), sys.argv[1:4])
    manifest = read(base / "package-manifest.json")
    scenes = read(base / "scenes.json")["clips"]
    masks = read(base / "hit-masks.json")["entries"]
    files = {r["path"]: r["sha256"] for r in manifest["files"]}
    if manifest["version"] != "0.8.31-electron" or set(scenes) != set(masks):
        raise ValueError("Unexpected baseline")
    pilot_report = read(pilot / "media-verification.json")
    approved = {r["clip"]: (pilot / "B" / (r["clip"] + ".webm"), r["candidateSha256"])
                for r in pilot_report["clips"]}
    output = stage / "graded-media"
    output.mkdir()
    cv2.setNumThreads(1)
    with ThreadPoolExecutor(max_workers=6) as pool:
        jobs = [pool.submit(make_clip, clip, base / scene["file"], masks[clip], scene,
                            output / (clip + ".webm"), approved.get(clip), files[scene["file"]])
                for clip, scene in scenes.items()]
        reports = [job.result() for job in jobs]
    (stage / "grade-verification.json").write_text(json.dumps(
        dict(baseline=manifest["version"], frames=sum(row["frames"] for row in reports), clips=reports),
        indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
