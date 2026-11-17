"""Repair subject opacity in the dragonflame composite while retaining its dark-background look."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location("idle_bridges", Path(__file__).with_name("prepare-idle-bridges.py"))
bridges = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridges)

KERNEL = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
FLAME_NEIGHBORHOOD = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))


def smooth(low, high, values):
    t = np.clip((values - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def restore_opacity(frame):
    alpha = frame[:, :, 3]
    # Restore enclosed defects using nearby opaque character pixels. Keep
    # antialiasing at the silhouette and transparent effects outside it.
    distance = cv2.distanceTransform(np.uint8(alpha >= 96), cv2.DIST_L2, 5)
    closed = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, KERNEL)
    confidence = smooth(1.8, 4.5, distance) * smooth(229, 253, closed.astype(np.float32))
    confidence[:41] = 0
    deficit = (255 - alpha) * confidence
    exposure = smooth(180, 900, np.count_nonzero(deficit > 15))
    if exposure == 0:
        return frame

    rgb = frame[:, :, :3].astype(np.float32)
    maximum = rgb.max(axis=2)
    saturation = (maximum - rgb.min(axis=2)) / np.maximum(maximum, 1)
    # Vivid fire remains translucent, including over the upper body.
    protection = smooth(.36, .61, saturation) * smooth(100, 165, maximum)
    red, _, blue = rgb.transpose(2, 0, 1)
    flames = np.uint8((saturation > .60) & (red > 180))
    near_flame = cv2.dilate(flames, FLAME_NEIGHBORHOOD)
    core = near_flame * smooth(8, 28, red - blue) * smooth(188, 245, red)
    protection = np.maximum(protection, core)
    fixed = np.rint(alpha + deficit * exposure * (1 - protection)).astype(np.uint8)
    changed = fixed > alpha
    out = frame.copy()
    # Keep alpha * RGB approximately constant. This preserves the approved
    # composite over black and reduces how much white can show through.
    weight = alpha[changed].astype(np.float32) / fixed[changed]
    out[changed, :3] = np.rint(rgb[changed] * weight[:, None]).astype(np.uint8)
    out[:, :, 3] = fixed
    return out


def comparison(path, original, updated):
    positions = [60, 80, 101, 112, 130, 162, 175]
    sheet = Image.new("RGB", (len(positions) * 190, 4 * 211), "#535860")
    draw = ImageDraw.Draw(sheet)
    for col, index in enumerate(positions):
        for row, (frames, background, label) in enumerate([
            (original, "white", "Old / white"), (updated, "white", "New / white"),
            (original, "black", "Old / black"), (updated, "black", "New / black"),
        ]):
            frame = Image.fromarray(frames[index]).resize((190, 190), Image.Resampling.LANCZOS)
            x, y = col * 190, row * 211
            sheet.paste(background, (x, y, x + 190, y + 190))
            sheet.paste(frame, (x, y), frame)
            draw.text((x + 3, y + 194), f"{label} / {index}", fill="white")
    sheet.save(path)


def corrected_yuva(old_file, original, adjusted):
    # Preserve the original luma and chroma samples outside the repaired mask.
    # An RGBA-to-YUV round trip on the whole clip changes untouched pixels.
    size = 384 * 384
    planes = (size, size // 4, size // 4, size)
    frame_bytes = sum(planes)
    yuv = np.frombuffer(subprocess.check_output([
        bridges.FF, "-v", "error", "-c:v", "libvpx-vp9", "-i", str(old_file),
        "-f", "rawvideo", "-pix_fmt", "yuva420p", "-"
    ]), dtype=np.uint8).reshape(-1, frame_bytes).copy()
    changes = adjusted[:, :, :, 3] != original[:, :, :, 3]
    indices = np.flatnonzero(changes.any(axis=(1, 2)))
    converted = np.frombuffer(subprocess.check_output([
        bridges.FF, "-v", "error", "-f", "rawvideo", "-pixel_format", "rgba",
        "-video_size", "384x384", "-framerate", "30", "-i", "-",
        "-f", "rawvideo", "-pix_fmt", "yuva420p", "-"
    ], input=adjusted[indices].tobytes()), dtype=np.uint8).reshape(-1, frame_bytes)
    for row, frame in enumerate(indices):
        mask = changes[frame]
        chroma = mask.reshape(192, 2, 192, 2).any(axis=(1, 3))
        indices_to_replace = np.concatenate([mask.ravel(), chroma.ravel(), chroma.ravel(), mask.ravel()])
        yuv[frame, indices_to_replace] = converted[row, indices_to_replace]
    return yuv, indices


def prepare(base, records, stage):
    output = stage / "candidate-media"
    output.mkdir(parents=True, exist_ok=False)
    old_file = base / "media/dragonflame.webm"
    clip = json.loads((records / "clip.json").read_text(encoding="utf-8-sig"))
    review = json.loads((records / "review.json").read_text(encoding="utf-8-sig"))
    if bridges.sha(old_file) != clip["videoSha256"]:
        raise RuntimeError("Installed video differs from the current source")
    original = bridges.decode(old_file)
    adjusted = np.stack([restore_opacity(frame) for frame in original])
    yuv, changed_frames = corrected_yuva(old_file, original, adjusted)
    video = output / clip["videoFile"]
    subprocess.run([
        bridges.FF, "-v", "error", "-n", "-f", "rawvideo", "-pixel_format", "yuva420p",
        "-video_size", "384x384", "-framerate", "30", "-i", "-", "-an", "-c:v",
        "libvpx-vp9", "-lossless", "1", "-pix_fmt", "yuva420p", "-auto-alt-ref",
        "0", "-threads", "4", "-cpu-used", "5", str(video)
    ], input=yuv.tobytes(), check=True)
    decoded = bridges.decode(video)
    if decoded.shape != original.shape or len(decoded) != clip["frames"]:
        raise RuntimeError("Unexpected packaged frame count or resolution")
    mask_file = records / clip["maskFile"]
    packed = np.packbits((decoded[:, :, :, 3] > 10).reshape(-1), bitorder="little").tobytes()
    if packed != mask_file.read_bytes():
        raise RuntimeError("Correction changed the click-through silhouette")
    peak = 112
    delta = decoded[peak, :, :, 3].astype(np.int16) - original[peak, :, :, 3]
    restored = delta >= 15
    before = original[peak, :, :, :3].astype(np.float32) * (original[peak, :, :, 3:4] / 255)
    after = decoded[peak, :, :, :3].astype(np.float32) * (decoded[peak, :, :, 3:4] / 255)
    dark_error = float(np.abs(before[restored] - after[restored]).mean())
    if np.count_nonzero(restored) < 5000 or dark_error > 2.5:
        raise RuntimeError("Opacity repair or dark-background preservation fell outside tolerance")
    if changed_frames[0] < 25 or changed_frames[-1] > 181:
        raise RuntimeError("Correction extended beyond the flame-light sequence")
    rest = np.r_[0:25, 182:len(decoded)]
    if not np.array_equal(original[rest], decoded[rest]):
        raise RuntimeError("The animation outside the flame-light sequence changed")
    receipt = {
        "beforeVideoSha256": clip["videoSha256"],
        "frames": len(decoded),
        "changedFrames": [int(changed_frames[0]), int(changed_frames[-1])],
        "peakFrame": peak,
        "peakPixelsRestored": int(restored.sum()),
        "peakMeanWhiteLeakReduction": round(float(delta[restored].mean()), 3),
        "peakMeanDarkCompositeRgbError": round(dark_error, 3),
        "hitMaskBitExact": True,
    }
    clip.update(videoSha256=bridges.sha(video), opacityRepair=receipt)
    review.update(videoSha256=clip["videoSha256"], opacityRepair=receipt,
                  sourceUserVisualAcceptance=review.get("sourceUserVisualAcceptance", review.get("userVisualAcceptance", False)),
                  userVisualAcceptance=False)
    for name, data in (("clip.json", clip), ("review.json", review)):
        (output / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (stage / "matte-report.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    comparison(stage / "before-after-backgrounds.png", original, decoded)
    print(json.dumps(receipt))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for name in ("installed", "records", "stage"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    prepare(args.installed, args.records, args.stage)
