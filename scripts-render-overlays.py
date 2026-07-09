#!/usr/bin/env python3
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WIDTH = 1080
HEIGHT = 1920
SAFE_X = 72
SAFE_TOP = 180
SAFE_BOTTOM = 180


def find_font(size, bold=True):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for path in candidates:
        if path and os.path.exists(path):
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:
                pass
    return ImageFont.load_default()


def fit_cover(img):
    img = img.convert("RGB")
    ratio = max(WIDTH / img.width, HEIGHT / img.height)
    size = (int(img.width * ratio), int(img.height * ratio))
    img = img.resize(size, Image.Resampling.LANCZOS)
    left = (img.width - WIDTH) // 2
    top = (img.height - HEIGHT) // 2
    return img.crop((left, top, left + WIDTH, top + HEIGHT))


def text_size(draw, text, font, spacing=10, stroke_width=0):
    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=spacing, stroke_width=stroke_width)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def wrap_text(draw, text, font, max_width, stroke_width=0):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        if draw.textbbox((0, 0), test, font=font, stroke_width=stroke_width)[2] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return "\n".join(lines)


def render_overlay(input_path, output_path, scene, index, total):
    base = fit_cover(Image.open(input_path))
    base = base.filter(ImageFilter.GaussianBlur(14))
    base = base.point(lambda p: int(p * 0.55))

    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    title = scene.get("title", "").strip()
    body = scene.get("body", "").strip()

    title_font = find_font(58, bold=True)
    body_font = find_font(36, bold=False)

    max_text_width = WIDTH - SAFE_X * 2
    title_wrapped = wrap_text(draw, title, title_font, max_text_width, stroke_width=3)
    body_wrapped = wrap_text(draw, body, body_font, max_text_width, stroke_width=2)

    tw, th = text_size(draw, title_wrapped, title_font, spacing=12, stroke_width=3)
    bw, bh = text_size(draw, body_wrapped, body_font, spacing=10, stroke_width=2)

    box_w = max(tw, bw) + 80
    box_h = th + bh + 110
    box_x = (WIDTH - box_w) // 2
    box_y = max(SAFE_TOP, (HEIGHT - box_h - 120) // 2)

    panel = Image.new("RGBA", (int(box_w), int(box_h)), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(panel)
    pdraw.rounded_rectangle((0, 0, box_w, box_h), radius=34, fill=(0, 0, 0, 175), outline=(255, 255, 255, 90), width=2)
    overlay.alpha_composite(panel, (int(box_x), int(box_y)))

    title_x = (WIDTH - tw) // 2
    title_y = box_y + 36
    draw.multiline_text(
        (title_x, title_y),
        title_wrapped,
        font=title_font,
        fill=(255, 255, 255, 255),
        spacing=12,
        align="center",
        stroke_width=4,
        stroke_fill=(20, 10, 50, 230),
    )

    body_x = (WIDTH - bw) // 2
    body_y = title_y + th + 28
    draw.multiline_text(
        (body_x, body_y),
        body_wrapped,
        font=body_font,
        fill=(235, 245, 255, 255),
        spacing=10,
        align="center",
        stroke_width=2,
        stroke_fill=(0, 0, 0, 200),
    )

    dot_y = HEIGHT - 120
    start_x = (WIDTH - (total * 34 + (total - 1) * 18)) // 2
    for i in range(total):
        fill = (255, 255, 255, 235) if i == index else (255, 255, 255, 90)
        x = start_x + i * 52
        draw.ellipse((x, dot_y, x + 34, dot_y + 34), fill=fill)

    out = Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")
    out.save(output_path, quality=95)


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: scripts-render-overlays.py <scenes.json> <input1> ... <output_dir>", file=sys.stderr)
        sys.exit(1)

    scenes_path = sys.argv[1]
    output_dir = sys.argv[-1]
    inputs = sys.argv[2:-1]

    with open(scenes_path, "r", encoding="utf-8") as f:
        script = json.load(f)

    scenes = script.get("scenes", [])
    if not scenes:
        print("No scenes in JSON", file=sys.stderr)
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    total = min(len(inputs), len(scenes))
    for idx in range(total):
        output_path = os.path.join(output_dir, f"scene_{idx + 1}.png")
        render_overlay(inputs[idx], output_path, scenes[idx], idx, total)
        print(output_path)
