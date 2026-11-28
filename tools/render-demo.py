#!/usr/bin/env python3
"""Render real screen captures over one continuous, natural-speed narration.

Requires Python 3.10+, Pillow, ffmpeg with libx264/drawtext, and ffprobe.
Print an example manifest with --example. Relative media paths resolve beside
the manifest. crop is [left, top, width, height] in the oriented source image.
Only supplied images, explanatory headings and supplied SRT text are rendered;
this script does not invent app screens, pointer actions, speech or timings.

Example:
  python tools/render-demo.py /path/manifest.json --check
  python tools/render-demo.py /path/manifest.json --output /path/demo-v1.mp4 \
      --work-dir /path/render-v1

The output length follows the measured narration, with at most one extra video
frame. An explicitly authored ending of up to 2.1 seconds is allowed by setting
pad_tail_silence: true and duration to the intended total timeline length. Only
trailing silence is added. No tempo adjustment, audio trimming, -shortest or
target-duration cut is used. Review the real encoded video and audio before
publishing it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

WIDTH, HEIGHT, FPS = 1920, 1080, 24
STAGE = (64, 112, 1792, 800)
CAPTION_TOP = 936
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
COLORS = {"canvas": "#24182d", "band": "#1b1322", "border": "#6f587d",
          "text": "#f4edf8", "muted": "#c4b3d3"}


def run(args: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(args, check=True, capture_output=True, text=True, cwd=cwd)


def probe(path: Path) -> dict:
    return json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format",
                           "-of", "json", str(path)]).stdout)


def media_path(value, base: Path, label: str) -> Path:
    if not isinstance(value, str) or not value or "://" in value:
        raise ValueError(f"{label} must be an existing local file path.")
    path = Path(value).expanduser()
    path = (base / path).resolve() if not path.is_absolute() else path.resolve()
    if not path.is_file():
        raise ValueError(f"{label} does not exist: {path}")
    return path


def number(value, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be a finite number of seconds.")
    return float(value)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def wrap_caption(text: str, font: ImageFont.FreeTypeFont) -> list[str]:
    words = text.split()
    if not words:
        raise ValueError("A subtitle cue contains no text.")
    lines, line = [], ""
    for word in words:
        candidate = f"{line} {word}" if line else word
        if font.getlength(candidate) <= 1720:
            line = candidate
        else:
            if not line or font.getlength(word) > 1720:
                raise ValueError("A subtitle word cannot fit the caption band.")
            lines.append(line)
            line = word
    lines.append(line)
    if len(lines) > 2:
        raise ValueError("A subtitle cue needs more than two lines; split it using the real word timings.")
    return lines


def read_srt(path: Path, duration: float, font: ImageFont.FreeTypeFont) -> list[dict]:
    def stamp(value: str) -> float:
        match = re.fullmatch(r"(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})", value)
        if not match:
            raise ValueError(f"Invalid SRT timestamp: {value}")
        hours, minutes, seconds, millis = map(int, match.groups())
        if minutes >= 60 or seconds >= 60:
            raise ValueError(f"Invalid SRT timestamp: {value}")
        return hours * 3600 + minutes * 60 + seconds + millis / 1000

    cues, previous_end = [], 0.0
    for index, block in enumerate(re.split(r"\n\s*\n", path.read_text(encoding="utf-8-sig").strip()), 1):
        lines = block.splitlines()
        if lines and lines[0].strip().isdigit():
            lines.pop(0)
        if len(lines) < 2 or " --> " not in lines[0]:
            raise ValueError(f"SRT cue {index} has no valid timing/text.")
        parts = lines.pop(0).split(" --> ")
        if len(parts) != 2:
            raise ValueError(f"Invalid SRT cue {index} timing.")
        start, end = map(lambda value: stamp(value.strip()), parts)
        if start < previous_end - 0.001 or start < 0 or end <= start or end > duration + 0.02:
            raise ValueError(f"SRT cue {index} overlaps, is reversed, or exceeds the narration.")
        text = " ".join(lines).strip()
        if re.search(r"</?(?:b|i|u|font)\b", text, re.I) or "{\\" in text:
            raise ValueError(f"SRT cue {index}: supply plain text, without subtitle formatting tags.")
        cues.append({"start": start, "end": end, "text": text, "lines": wrap_caption(text, font)})
        previous_end = end
    if not cues:
        raise ValueError("The supplied SRT has no cues.")
    return cues


def source_image(path: Path, crop: list[int] | None) -> Image.Image:
    with Image.open(path) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
    if crop is not None:
        if (not isinstance(crop, list) or len(crop) != 4
                or any(type(value) is not int for value in crop)):
            raise ValueError(f"crop must be four integers [left, top, width, height]: {path}")
        left, top, width, height = crop
        if left < 0 or top < 0 or width <= 0 or height <= 0 or left + width > image.width or top + height > image.height:
            raise ValueError(f"Crop lies outside the source image: {path}")
        image = image.crop((left, top, left + width, top + height))
    return image


def load_plan(manifest_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    base = manifest_path.parent
    audio = media_path(manifest.get("audio"), base, "audio")
    metadata = probe(audio)
    streams = [stream for stream in metadata.get("streams", []) if stream.get("codec_type") == "audio"]
    if len(streams) != 1:
        raise ValueError("Narration must contain exactly one audio stream.")
    stream = streams[0]
    if stream.get("channels") not in (1, 2):
        raise ValueError("Supply a mono or stereo narration master.")
    narration_duration = float(stream.get("duration", metadata.get("format", {}).get("duration", "nan")))
    if not math.isfinite(narration_duration) or not 0 < narration_duration < 180:
        raise ValueError("Measured narration must be positive and shorter than 180 seconds. Do not speed it up to fit.")
    if abs(float(stream.get("start_time", 0))) > 0.02:
        raise ValueError("Narration has a nonzero start timestamp; supply the intended master starting at zero.")
    declared = number(manifest.get("duration"), "duration")
    pad_tail = manifest.get("pad_tail_silence", False)
    if type(pad_tail) is not bool:
        raise ValueError("pad_tail_silence must be true or false.")
    tail_silence = declared - narration_duration if pad_tail else 0.0
    if pad_tail and not 0 <= tail_silence <= 2.1:
        raise ValueError("The explicitly authored silent ending must be between 0 and 2.1 seconds; speech is never trimmed.")
    if not pad_tail and abs(declared - narration_duration) > 0.02:
        raise ValueError(f"Manifest duration {declared:.6f}s differs from measured audio {narration_duration:.6f}s.")
    duration = declared if pad_tail else narration_duration
    frames = math.ceil(duration * FPS - 1e-8)
    if frames / FPS >= 180:
        raise ValueError("Narration is too close to 180 seconds to leave a complete final video frame under the limit.")
    regular = media_path(manifest.get("font", FONT_REGULAR), base, "font")
    bold = media_path(manifest.get("heading_font", FONT_BOLD), base, "heading_font")
    caption_font = ImageFont.truetype(str(regular), 42)
    clips = manifest.get("clips")
    if not isinstance(clips, list) or not clips:
        raise ValueError("clips must contain at least one timed actual capture.")
    prepared, previous_end, previous_frame = [], 0.0, 0
    for index, clip in enumerate(clips):
        if not isinstance(clip, dict):
            raise ValueError(f"Clip {index + 1} must be an object.")
        start, end = number(clip.get("start"), "clip.start"), number(clip.get("end"), "clip.end")
        if abs(start - previous_end) > 0.001 or end <= start:
            raise ValueError(f"Clip {index + 1} has a gap/overlap or reversed interval. Use contiguous absolute times.")
        if end > duration + 0.02:
            raise ValueError(f"Clip {index + 1} extends beyond the narration.")
        end_frame = frames if index == len(clips) - 1 else round(end * FPS)
        if end_frame <= previous_frame:
            raise ValueError(f"Clip {index + 1} is shorter than one output frame.")
        path = media_path(clip.get("image"), base, f"clip {index + 1} image")
        image = source_image(path, clip.get("crop"))
        heading = clip.get("heading", "")
        if not isinstance(heading, str) or "\n" in heading:
            raise ValueError("Each heading must be one line of explanatory text.")
        if ImageFont.truetype(str(bold), 32).getlength(heading) > 1450:
            raise ValueError(f"Clip {index + 1} heading is too long; shorten the explanation.")
        prepared.append({**clip, "image": path, "start": start, "end": end,
                         "first_frame": previous_frame, "end_frame": end_frame,
                         "source_size_after_crop": list(image.size), "heading": heading})
        previous_end, previous_frame = end, end_frame
    if abs(previous_end - duration) > 0.02:
        raise ValueError("The last clip must end at the measured narration duration.")
    srt = media_path(manifest["srt"], base, "srt") if manifest.get("srt") else None
    captions = read_srt(srt, narration_duration, caption_font) if srt else []
    return {"audio": audio, "duration": duration, "declared_duration": declared, "frames": frames,
            "narration_duration": narration_duration, "tail_silence": tail_silence,
            "audio_metadata": metadata, "clips": prepared, "captions": captions,
            "srt": srt, "font": regular, "heading_font": bold}


def compose(clip: dict, destination: Path, bold: Path, regular: Path) -> dict:
    canvas = Image.new("RGB", (WIDTH, HEIGHT), COLORS["canvas"])
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, CAPTION_TOP, WIDTH, HEIGHT), fill=COLORS["band"])
    draw.line((64, CAPTION_TOP, WIDTH - 64, CAPTION_TOP), fill=COLORS["border"], width=1)
    brand_font = ImageFont.truetype(str(regular), 22)
    draw.text((WIDTH - 64, 39), "PHANTOMDESK", font=brand_font, fill=COLORS["muted"], anchor="ra")
    size = 42
    heading_font = ImageFont.truetype(str(bold), size)
    while heading_font.getlength(clip["heading"]) > 1450:
        size -= 1
        heading_font = ImageFont.truetype(str(bold), size)
    draw.text((64, 28), clip["heading"], font=heading_font, fill=COLORS["text"])
    image = source_image(clip["image"], clip.get("crop"))
    _, _, max_width, max_height = STAGE
    fit = min((max_width - 4) / image.width, (max_height - 4) / image.height)
    displayed = image.resize((round(image.width * fit), round(image.height * fit)), Image.Resampling.LANCZOS)
    left = STAGE[0] + (max_width - displayed.width) // 2
    top = STAGE[1] + (max_height - displayed.height) // 2
    draw.rectangle((left - 2, top - 2, left + displayed.width + 1, top + displayed.height + 1),
                   fill=COLORS["border"])
    canvas.paste(displayed, (left, top))
    canvas.save(destination)
    return {"placed_box": [left, top, displayed.width, displayed.height], "uniform_scale": fit}


def render(plan: dict, manifest: Path, output: Path, work: Path) -> dict:
    if output.exists():
        raise ValueError(f"Refusing to overwrite an existing render: {output}")
    if work.exists() and any(work.iterdir()):
        raise ValueError(f"Use a new empty render work directory: {work}")
    work.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(plan["font"], work / "caption-font.ttf")
    concat = ["ffconcat version 1.0"]
    assets = []
    for index, clip in enumerate(plan["clips"]):
        filename = f"scene-{index:03}.png"
        geometry = compose(clip, work / filename, plan["heading_font"], plan["font"])
        count = clip["end_frame"] - clip["first_frame"]
        concat += [f"file '{filename}'", "option framerate 24", f"duration {count / FPS:.9f}"]
        assets.append({**clip, "image": str(clip["image"]), "sha256": sha256(clip["image"]), **geometry})
    # A final timestamp makes the last still's duration explicit. The finite,
    # audio-derived frame count excludes this sentinel frame from the output.
    concat += [f"file 'scene-{len(plan['clips']) - 1:03}.png'", "option framerate 24"]
    (work / "pictures.ffconcat").write_text("\n".join(concat) + "\n", encoding="utf-8")
    filters = ["fps=24", "setsar=1"]
    for cue_index, cue in enumerate(plan["captions"]):
        lines = cue["lines"]
        for line_index, text in enumerate(lines):
            filename = f"caption-{cue_index:03}-{line_index}.txt"
            (work / filename).write_text(text, encoding="utf-8")
            y = 980 if len(lines) == 1 else 954 + line_index * 52
            enable = f"gte(t,{cue['start']:.6f})*lt(t,{cue['end']:.6f})"
            filters.append(f"drawtext=fontfile=caption-font.ttf:textfile={filename}:expansion=none:"
                           f"fontsize=42:fontcolor=0xf4edf8:borderw=1:bordercolor=0x1b1322:"
                           f"x=(w-text_w)/2:y={y}:enable='{enable}'")
    filters += ["scale=out_color_matrix=bt709:out_range=tv", "format=yuv420p"]
    (work / "video-filter.txt").write_text(",".join(filters), encoding="utf-8")
    command = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "warning", "-n",
               "-f", "concat", "-safe", "0", "-i", "pictures.ffconcat", "-i", str(plan["audio"]),
               "-map", "0:v:0", "-map", "1:a:0", "-filter_script:v", "video-filter.txt",
               "-frames:v", str(plan["frames"]), "-c:v", "libx264", "-preset", "veryfast",
               "-tune", "stillimage", "-crf", "18", "-threads", "4", "-pix_fmt", "yuv420p",
               "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
               "-color_range", "tv", "-c:a", "aac", "-b:a", "192k", "-ar", "48000"]
    if plan["tail_silence"]:
        command += ["-af", f"apad=pad_dur={plan['tail_silence']:.9f}"]
    command += ["-movflags", "+faststart", str(output)]
    (work / "command.json").write_text(json.dumps(command, indent=2) + "\n", encoding="utf-8")
    try:
        result = run(command, cwd=work)
    except subprocess.CalledProcessError as error:
        (work / "ffmpeg.log").write_text(error.stderr or "", encoding="utf-8")
        raise RuntimeError(f"FFmpeg failed; inspect {work / 'ffmpeg.log'}") from error
    (work / "ffmpeg.log").write_text(result.stderr, encoding="utf-8")
    measured = probe(output)
    video = next(stream for stream in measured["streams"] if stream["codec_type"] == "video")
    audio = next(stream for stream in measured["streams"] if stream["codec_type"] == "audio")
    actual_duration = float(measured["format"]["duration"])
    if (video["width"], video["height"], video["r_frame_rate"], video["codec_name"], video["pix_fmt"]) != (
            WIDTH, HEIGHT, "24/1", "h264", "yuv420p"):
        raise RuntimeError("The encoded video does not match the required delivery format.")
    if int(video.get("nb_frames", -1)) != plan["frames"]:
        raise RuntimeError("The encoded frame count differs from the authored timeline.")
    if not actual_duration < 180 or abs(float(audio["duration"]) - plan["duration"]) > 0.05:
        raise RuntimeError("Encoded duration exceeds the limit or narration elapsed time changed unexpectedly.")
    if abs(actual_duration - plan["duration"]) > 1 / FPS + 0.025:
        raise RuntimeError("The final duration differs beyond expected frame/AAC rounding.")
    run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(output),
         "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"])
    report = {"manifest": str(manifest), "output": str(output), "duration": actual_duration,
              "narration_duration": plan["narration_duration"], "narration_sha256": sha256(plan["audio"]),
              "timeline_duration": plan["duration"], "tail_silence_seconds": plan["tail_silence"],
              "narration_speed": 1, "frames": plan["frames"], "fps": FPS, "clips": assets,
              "subtitle_cues": len(plan["captions"]), "captions": plan["captions"],
              "output_metadata": measured, "full_decode": "passed",
              "listening_review": "not_performed",
              "review_limit": "Technical checks passed; complete visual review is still required. Audible quality has not been checked by listening."}
    (work / "render-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("manifest", nargs="?", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--work-dir", type=Path)
    parser.add_argument("--check", action="store_true", help="Validate real inputs and report timings without rendering.")
    parser.add_argument("--example", action="store_true", help="Print an illustrative schema; it is not a finished edit.")
    args = parser.parse_args()
    if args.example:
        print(json.dumps({"audio": "narration.wav", "duration": 20.0, "srt": "narration.srt",
                          "clips": [{"image": "captures/approved.jpg", "start": 0, "end": 9.5,
                                     "heading": "Approval belongs to these saved instructions"},
                                    {"image": "captures/changed.jpg", "start": 9.5, "end": 20.0,
                                     "heading": "Changed instructions need a new review",
                                     "crop": [300, 100, 1000, 700]}]}, indent=2))
        return 0
    if not args.manifest or (not args.check and not args.output):
        parser.error("Provide a manifest and either --check or --output.")
    for binary in ("ffmpeg", "ffprobe"):
        if not shutil.which(binary):
            raise ValueError(f"Required executable is missing: {binary}")
    manifest = args.manifest.resolve()
    plan = load_plan(manifest)
    summary = {"narration_duration": plan["narration_duration"], "video_duration": plan["frames"] / FPS,
               "tail_silence_seconds": plan["tail_silence"],
               "frames": plan["frames"], "clips": len(plan["clips"]), "subtitle_cues": len(plan["captions"])}
    print(json.dumps(summary, indent=2), flush=True)
    if args.check:
        return 0
    output = args.output.resolve()
    if output.suffix.lower() != ".mp4":
        raise ValueError("Output must be an .mp4 file.")
    work = args.work_dir.resolve() if args.work_dir else output.with_suffix(".render")
    report = render(plan, manifest, output, work)
    print(f"Rendered {report['duration']:.3f}s: {output}")
    print(f"Audit and lossless composed frames: {work}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, RuntimeError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        print(f"Render error: {error}", file=sys.stderr)
        raise SystemExit(1)
