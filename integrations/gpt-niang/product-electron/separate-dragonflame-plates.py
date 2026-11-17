"""Separate the dragonflame subject from the clipped haze in the source composite."""
import argparse
import importlib.util
import json
from pathlib import Path
import runpy
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location("dragonflame_rekey", Path(__file__).with_name("rekey-dragonflame.py"))
rekey = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rekey)
bridges = rekey.bridges
smooth = rekey.smooth
CHARACTER_KERNEL = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
ROWS = np.arange(384)[:, None]


def rgb_channels(frame):
    rgb = frame[:, :, :3].astype(np.float32)
    red, green, blue = rgb.transpose(2, 0, 1)
    peak = rgb.max(axis=2)
    saturation = (peak - rgb.min(axis=2)) / np.maximum(peak, 1)
    return rgb, red, green, blue, peak, saturation


def distance_to(mask):
    if not mask.any():
        return np.full(mask.shape, 1000, dtype=np.float32)
    return cv2.distanceTransform(np.uint8(~mask), cv2.DIST_L2, 5)


def remove_spill(red, green, blue):
    green_cast = smooth(8, 28, green - np.maximum(red, blue))
    olive_cast = smooth(12, 36, green - blue) * (1 - smooth(5, 24, red - green))
    return (1 - green_cast) * (1 - olive_cast)


def separate(frame, reference, index):
    source, red, green, blue, peak, saturation = rgb_channels(reference)
    raw_alpha = reference[:, :, 3].astype(np.float32)
    approved, old_red, old_green, old_blue, old_peak, old_saturation = rgb_channels(frame)
    old_alpha = frame[:, :, 3].astype(np.float32)
    clean = remove_spill(red, green, blue)
    # Skin, hair and fabric provide a per-frame subject matte. Close the
    # neighboring ink lines without bringing back the raw green-screen smoke.
    material = (peak >= 149) & (saturation < .40) & (clean > .85) & (raw_alpha > 212)
    material = cv2.morphologyEx(np.uint8(material), cv2.MORPH_CLOSE, CHARACTER_KERNEL) > 0
    body_distance = distance_to(material)
    body = (1 - smooth(1.4, 3.8, body_distance)) * clean
    body_keep = (1 - smooth(2.6, 5.2, body_distance)) * smooth(11, 83, raw_alpha)
    body_alpha = raw_alpha * body
    body_alpha[305:] = 0  # Keep the previously approved shoe cleanup.

    # Retain painted flame and sparks with feathered edges. Haze that is
    # neither near a real spark nor supported by the source body is discarded.
    vivid = (old_saturation > .53) & (old_red > 135) & (old_red > old_green + 23) & (old_alpha >= 102)
    warm = (old_red > 170) & (old_green > 70) & (old_red > old_blue + 45) & (old_alpha >= 72)
    effect_distance = distance_to(vivid | warm)
    effect = 1 - smooth(.6, 3.7, effect_distance)
    solid = smooth(132, 207, old_alpha)
    olive = smooth(14, 42, old_green - old_blue) * (1 - smooth(7, 31, old_red - old_green))
    olive *= 1 - smooth(196, 232, old_peak)
    keep = np.maximum(body_keep, np.maximum(effect, solid) * (1 - olive))
    keep[304:] = 1
    body_alpha[(ROWS < 100) & (effect_distance < 4.2)] = 0
    strength = smooth(26, 31, index) * (1 - smooth(173, 178, index))
    target = np.maximum(old_alpha * keep, body_alpha)
    target *= smooth(0, 10, ROWS)  # Soften the original clipped tip of the flame.
    new_alpha = np.rint(old_alpha + (target - old_alpha) * strength).astype(np.uint8)

    result = frame.copy()
    restored = new_alpha > old_alpha
    weight = (1 - smooth(115, 224, old_alpha[restored])) * smooth(.22, .82, body[restored])
    result[restored, :3] = np.rint(
        approved[restored] * (1 - weight[:, None]) + source[restored] * weight[:, None]
    ).clip(0, 255).astype(np.uint8)
    result[:, :, 3] = new_alpha
    exterior_haze = (body_distance > 5.2) & (effect_distance > 3.7) & (old_alpha >= 16) & (old_alpha < 110) & (ROWS < 304)
    horn = (ROWS < 96) & (raw_alpha >= 245) & (body > .98) & (effect_distance > 4.2)
    return result, exterior_haze, horn


def sheet(path, previous, updated, worst):
    frames = sorted(set(range(26, 180, 5)) | {worst, 80, 101, 112, 162, 177})
    width, size, stride = 8, 142, 161
    pairs = (len(frames) + width - 1) // width
    image = Image.new("RGB", (width * size, pairs * 2 * stride), "#555b63")
    draw = ImageDraw.Draw(image)
    for i, frame in enumerate(frames):
        x, row = i % width * size, i // width * 2 * stride
        for offset, label, source in ((0, "old", previous), (stride, "new", updated)):
            foreground = Image.fromarray(rekey.compose(source[frame], 255)).resize((size, size))
            image.paste(foreground, (x, row + offset))
            draw.text((x + 4, row + offset + size + 2), f"{label} {frame}", fill="white")
    image.save(path)


def run(base, records, studio, stage):
    output = stage / "candidate-media"
    output.mkdir(parents=True, exist_ok=False)
    clip = json.loads((records / "clip.json").read_text(encoding="utf-8-sig"))
    review = json.loads((records / "review.json").read_text(encoding="utf-8-sig"))
    old_file = base / "media/dragonflame.webm"
    if bridges.sha(old_file) != clip["videoSha256"]:
        raise RuntimeError("Installed video differs from recorded baseline")
    raw_file = studio / "work/boutique_v4/s1_best.mp4"
    raw_hash = bridges.sha(raw_file)
    if raw_hash != rekey.RAW_TAKE_SHA256:
        raise RuntimeError("Unexpected green-screen take")

    previous = bridges.decode(old_file)
    frames = previous.copy()
    haze = {}
    horns = {}
    key = runpy.run_path(str(studio / "work/boutique_v2/align_keyframes.py"))["key_frame"]
    warp = runpy.run_path(str(studio / "scripts/normalize_step03.py"))["warp_frame_rgba"]
    capture = cv2.VideoCapture(str(raw_file))
    try:
        for index in range(178):
            ok, bgr = capture.read()
            if not ok:
                raise RuntimeError(f"Raw take decode failed at frame {index}")
            if index <= 26:
                continue
            rgba = key(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), preserve_detached=False)
            aligned = warp(rgba, .3414358974358974, 187.944, -6.336410256410261)
            reference = np.pad(aligned[:, 132:516], ((0, 24), (0, 0), (0, 0)))
            frames[index], haze[index], horns[index] = separate(previous[index], reference, index)
    finally:
        capture.release()

    yuv, changed = rekey.matte.corrected_yuva(old_file, previous, frames)
    video = output / clip["videoFile"]
    subprocess.run([
        bridges.FF, "-v", "error", "-n", "-f", "rawvideo", "-pix_fmt", "yuva420p",
        "-s", "384x384", "-r", "30", "-i", "-", "-an", "-c:v", "libvpx-vp9", "-lossless", "1",
        "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-threads", "4", "-cpu-used", "5", str(video)
    ], input=yuv.tobytes(), check=True)
    del frames, yuv
    decoded = bridges.decode(video)
    if decoded.shape != previous.shape or len(decoded) != clip["frames"]:
        raise RuntimeError("Action duration or size changed")
    unchanged = np.setdiff1d(np.arange(len(decoded)), changed)
    if not np.array_equal(decoded[unchanged], previous[unchanged]):
        raise RuntimeError("Pixels outside repair changed")
    alpha, old_alpha = decoded[:, :, :, 3], previous[:, :, :, 3]
    fully_processed = range(31, 174)
    before_haze = [int(haze[i].sum()) for i in fully_processed]
    after_haze = [int(np.count_nonzero((alpha[i] > 2) & haze[i])) for i in fully_processed]
    if max(before_haze) < 1000 or any(after_haze):
        raise RuntimeError("Straight-edged exterior haze remains")
    before_horns = sum(int(np.count_nonzero((old_alpha[i] < 230) & horns[i])) for i in fully_processed)
    after_horns = sum(int(np.count_nonzero((alpha[i] < 230) & horns[i])) for i in fully_processed)
    if after_horns * 12 > before_horns:
        raise RuntimeError("The source-supported upper silhouette is still translucent")
    if np.any(alpha[:, 305:] != old_alpha[:, 305:]):
        raise RuntimeError("Shoe cleanup changed")
    mask = output / clip["maskFile"]
    mask.write_bytes(np.packbits((alpha > 10).reshape(-1), bitorder="little").tobytes())
    if mask.stat().st_size != clip["maskBytes"]:
        raise RuntimeError("Hit mask frame count changed")

    stats = {
        "previousVideoSha256": clip["videoSha256"], "rawGreenScreenSha256": raw_hash,
        "frames": len(decoded), "changedFrameRange": [int(changed[0]), int(changed[-1])],
        "worstHazeFrame": int(np.argmax(before_haze)) + 31,
        "worstExteriorHazePixelsBefore": max(before_haze), "worstExteriorHazePixelsAfter": max(after_haze),
        "sourceSupportedUpperSilhouetteLowOpacityBefore": before_horns,
        "sourceSupportedUpperSilhouetteLowOpacityAfter": after_horns,
        "outsideRepairFramesBitExact": True
    }
    clip.update(videoSha256=bridges.sha(video), maskSha256=bridges.sha(mask), effectSeparation=stats)
    review.update(videoSha256=clip["videoSha256"], effectSeparation=stats, userVisualAcceptance=False)
    for name, value in (("clip.json", clip), ("review.json", review)):
        (output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    rekey.preview(stage / "dragonflame-white-black-compare.mp4", previous, decoded, bridges.decode(base / "media/frontidle.webm"))
    sheet(stage / "white-timeline.png", previous, decoded, stats["worstHazeFrame"])
    (stage / "plate-report.json").write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(stats))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for name in ("base", "records", "studio", "stage"):
        parser.add_argument(name, type=Path)
    run(**vars(parser.parse_args()))
