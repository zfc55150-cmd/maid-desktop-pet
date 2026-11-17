"""Recover character details lost by the source dragonflame key from its green-screen take."""
import argparse
import importlib.util
import json
from pathlib import Path
import runpy
import subprocess

import cv2
import numpy as np

spec = importlib.util.spec_from_file_location("matte_repair", Path(__file__).with_name("repair-dragonflame-matte.py"))
matte = importlib.util.module_from_spec(spec)
spec.loader.exec_module(matte)
bridges = matte.bridges

def smooth(low, high, values):
    progress = np.clip((values - low) / (high - low), 0, 1)
    return progress * progress * (3 - 2 * progress)


RAW_TAKE_SHA256 = "543e69ca03ac752d401e770d43e8417a4e840fae645a77db6ff6c4dc5d478612"
BODY_KERNEL = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19))


def restore_character_details(current, original, reference, frame_index):
    source_alpha = original[:, :, 3]
    current_alpha = current[:, :, 3]
    raw_alpha = reference[:, :, 3]
    body = cv2.morphologyEx(np.uint8(source_alpha >= 222), cv2.MORPH_CLOSE, BODY_KERNEL)
    distance = cv2.distanceTransform(body, cv2.DIST_L2, 5)
    red, green, blue = reference[:, :, :3].astype(np.float32).transpose(2, 0, 1)
    maximum = np.maximum(np.maximum(red, green), blue)
    saturation = (maximum - np.minimum(np.minimum(red, green), blue)) / np.maximum(maximum, 1)
    clean_screen = 1 - smooth(9, 35, green - np.maximum(red, blue))
    fire = smooth(.45, .72, saturation) * smooth(132, 215, maximum) * smooth(15, 50, red - green)
    depth_support = smooth(.6, 3.1, distance)
    source_support = smooth(195, 247, raw_alpha.astype(np.float32))
    confidence = depth_support * source_support * clean_screen * (1 - fire)
    confidence[307:] = 0  # Preserve the approved shoe and ground-spill repair.
    confidence *= smooth(26, 31, frame_index) * (1 - smooth(171, 178, frame_index))

    restored_alpha = np.rint(current_alpha + (255 - current_alpha) * confidence).astype(np.uint8)
    repaired = restored_alpha > current_alpha
    result = current.copy()
    ratio = current_alpha[repaired] / restored_alpha[repaired]
    dark_composite = current[repaired, :3].astype(np.float32) * ratio[:, None]
    ink_weight = 1 - smooth(65, 173, source_alpha[repaired].astype(np.float32))
    ink_weight *= smooth(.12, .78, confidence[repaired])
    raw_color = reference[repaired, :3].astype(np.float32)
    # Keep the approved warmth for usable pixels and restore raw color where the source key removed ink.
    color = dark_composite * (1 - ink_weight[:, None]) + raw_color * ink_weight[:, None]
    result[repaired, :3] = np.rint(color).clip(0, 255).astype(np.uint8)
    result[:, :, 3] = restored_alpha
    return result


def compose(frame, background):
    alpha = frame[:, :, 3:4].astype(np.float32) / 255
    return np.rint(frame[:, :, :3] * alpha + background * (1 - alpha)).astype(np.uint8)


def preview(out, old, fixed, idle):
    # Full-rate playback including both transitions and the original pause.
    with subprocess.Popen([
        bridges.FF, "-v", "error", "-n", "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", "768x768", "-r", "30", "-i", "-", "-an",
        "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)
    ], stdin=subprocess.PIPE) as writer:
        def write(previous, updated):
            white = np.hstack((compose(previous, 255), compose(updated, 255)))
            black = np.hstack((compose(previous, 0), compose(updated, 0)))
            writer.stdin.write(np.vstack((white, black)).tobytes())
        for frame in idle[-15:]:
            write(frame, frame)
        for previous, updated in zip(old, fixed):
            write(previous, updated)
        for frame in idle[:15]:
            write(frame, frame)
        writer.stdin.close()
        if writer.wait():
            raise RuntimeError("Preview encoding failed")


def run(base, original_base, records, studio, stage):
    output = stage / "candidate-media"
    output.mkdir(parents=True, exist_ok=False)
    clip = json.loads((records / "clip.json").read_text(encoding="utf-8-sig"))
    review = json.loads((records / "review.json").read_text(encoding="utf-8-sig"))
    previous_file = base / "media/dragonflame.webm"
    original_file = original_base / "media/dragonflame.webm"
    if bridges.sha(previous_file) != clip["videoSha256"] or bridges.sha(original_file) != clip["opacityRepair"]["beforeVideoSha256"]:
        raise RuntimeError("Repair baseline drift")
    original, previous = map(bridges.decode, (original_file, previous_file))
    adjusted = previous.copy()
    key = runpy.run_path(str(studio / "work/boutique_v2/align_keyframes.py"))["key_frame"]
    warp = runpy.run_path(str(studio / "scripts/normalize_step03.py"))["warp_frame_rgba"]
    raw_file = studio / "work/boutique_v4/s1_best.mp4"
    raw_hash = bridges.sha(raw_file)
    if raw_hash != RAW_TAKE_SHA256:
        raise RuntimeError("Unexpected green-screen take")
    capture = cv2.VideoCapture(str(raw_file))
    info = [int(capture.get(prop)) for prop in (cv2.CAP_PROP_FRAME_WIDTH, cv2.CAP_PROP_FRAME_HEIGHT, cv2.CAP_PROP_FPS, cv2.CAP_PROP_FRAME_COUNT)]
    if info != [782, 1176, 30, 180]:
        raise RuntimeError("Unexpected raw take geometry")
    # Stage 1 was placed with these coefficients before cropping for the product.
    try:
        for i in range(178):
            ok, bgr = capture.read()
            if not ok:
                raise RuntimeError(f"Raw decode failed at frame {i}")
            if i <= 26:
                continue
            rgba = key(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), preserve_detached=False)
            aligned = warp(rgba, .3414358974358974, 187.944, -6.336410256410261)
            reference = np.pad(aligned[:, 132:516], ((0, 24), (0, 0), (0, 0)))
            adjusted[i] = restore_character_details(previous[i], original[i], reference, i)
    finally:
        capture.release()
    yuv, indices = matte.corrected_yuva(previous_file, previous, adjusted)
    video = output / clip["videoFile"]
    subprocess.run([
        bridges.FF, "-v", "error", "-n", "-f", "rawvideo", "-pix_fmt", "yuva420p",
        "-s", "384x384", "-r", "30", "-i", "-", "-an", "-c:v", "libvpx-vp9", "-lossless", "1",
        "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-threads", "4", "-cpu-used", "5", str(video)
    ], input=yuv.tobytes(), check=True)
    del yuv, adjusted
    decoded = bridges.decode(video)
    if decoded.shape != previous.shape or len(decoded) != clip["frames"]:
        raise RuntimeError("Packed frame count or geometry drift")
    unchanged = np.setdiff1d(np.arange(len(decoded)), indices)
    if not np.array_equal(decoded[unchanged], previous[unchanged]):
        raise RuntimeError("Pixels outside the corrected interval changed")
    alpha, before = decoded[:, :, :, 3], previous[:, :, :, 3]
    visible, was_visible = alpha > 10, before > 10
    added = visible & ~was_visible
    if np.any(alpha < before) or np.any(added[:, 307:]) or int(added.sum(axis=(1, 2)).max()) > 1800:
        raise RuntimeError("Unexpected silhouette change")
    mask = output / clip["maskFile"]
    mask.write_bytes(np.packbits(visible.reshape(-1), bitorder="little").tobytes())
    if mask.stat().st_size != clip["maskBytes"]:
        raise RuntimeError("Mask frame count drift")
    recovered = ((alpha.astype(np.int16) - before) >= 20) & (before < 90)
    fixed = ((alpha.astype(np.int16) - before) >= 20)
    if min(int(recovered[i].sum()) for i in [60, 80, 101, 112, 124, 130]) < 200:
        raise RuntimeError("Expected missing lines were not recovered")
    stats = {
        "previousVideoSha256": clip["videoSha256"],
        "rawGreenScreenSha256": raw_hash,
        "frames": len(decoded),
        "changedFrameRange": [int(indices.min()), int(indices.max())],
        "nearTransparentPixelsRecovered": int(recovered.sum()),
        "peakFrame112Recovered": int(recovered[112].sum()),
        "peakFrame112WhiteLeakReducedPixels": int(fixed[112].sum()),
        "maxHitMaskPixelsAdded": int(added.sum(axis=(1, 2)).max()),
        "outsideRepairFramesBitExact": True
    }
    clip.update(videoSha256=bridges.sha(video), maskSha256=bridges.sha(mask), rekeyRepair=stats)
    review.update(videoSha256=clip["videoSha256"], rekeyRepair=stats, userVisualAcceptance=False)
    for name, value in (("clip.json", clip), ("review.json", review)):
        (output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    preview(stage / "dragonflame-before-after.mp4", previous, decoded, bridges.decode(base / "media/frontidle.webm"))
    (stage / "rekey-report.json").write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(stats))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for name in ("base", "original_base", "records", "studio", "stage"):
        parser.add_argument(name, type=Path)
    run(**vars(parser.parse_args()))
