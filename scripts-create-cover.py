#!/usr/bin/env python3
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WIDTH = 1080
HEIGHT = 1920

ACCENT_PRESETS = [
    {"accent": (0, 229, 255), "accent2": (112, 51, 255), "bg": (5, 0, 20)},
    {"accent": (255, 71, 87), "accent2": (255, 184, 0), "bg": (18, 3, 8)},
    {"accent": (88, 101, 242), "accent2": (0, 229, 255), "bg": (8, 12, 28)},
    {"accent": (46, 213, 115), "accent2": (0, 184, 148), "bg": (6, 18, 12)},
    {"accent": (255, 118, 117), "accent2": (162, 155, 254), "bg": (20, 8, 24)},
    {"accent": (253, 203, 110), "accent2": (225, 112, 85), "bg": (24, 14, 6)},
]


def find_font(size, bold=True):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/SF-Pro.ttf",
        "/System/Library/Fonts/SFCompact.ttf",
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


def text_dimensions(draw, text, font, spacing=14, stroke_width=0):
    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=spacing, stroke_width=stroke_width)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def wrap_text(draw, text, font, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        width = draw.textbbox((0, 0), test, font=font, stroke_width=4)[2]
        if width <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return "\n".join(lines)


def split_title_lines(text, max_lines=3, max_per_line=14):
    words = text.strip().split()
    lines = []
    current = ""

    for word in words:
        test = f"{current} {word}".strip()
        if len(test) <= max_per_line:
            current = test
        else:
            if current:
                lines.append(current.upper())
            current = word
            if len(lines) >= max_lines:
                break

    if current and len(lines) < max_lines:
        lines.append(current.upper())

    if not lines:
        lines = [text[:max_per_line].upper()]

    return "\n".join(lines[:max_lines])


def shorten(text, limit):
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def palette_from_topic(topic):
    digest = hashlib.md5(topic.encode("utf-8")).hexdigest()
    idx = int(digest[:8], 16) % len(ACCENT_PRESETS)
    return ACCENT_PRESETS[idx]


def build_palette_from_script(data):
    topic = data.get("topic", "").strip()
    scenes = data.get("scenes") or []
    scene1 = scenes[0] if scenes else {}
    scene2 = scenes[1] if len(scenes) > 1 else {}

    hook = scene1.get("title") or topic.split(":")[0] or topic
    strip = scene2.get("title") or shorten(topic, 52)
    subtitle = scene1.get("body") or topic
    colors = palette_from_topic(topic)

    return {
        **colors,
        "badge": "AI CREATOR",
        "title": split_title_lines(hook),
        "strip": shorten(strip, 52).upper(),
        "subtitle": shorten(subtitle, 120),
        "footer": shorten(topic, 70),
        "hashtags": "#AI #CreatorMoi #TikTokTips",
    }


def load_script_palette(mode):
    if mode.endswith(".json") and os.path.exists(mode):
        with open(mode, "r", encoding="utf-8") as handle:
            return build_palette_from_script(json.load(handle))

    presets = {
        "automation": {
            "bg": (5, 0, 20),
            "accent": (0, 229, 255),
            "accent2": (112, 51, 255),
            "badge": "AI CREATOR",
            "title": "AI LÀM\nCONTENT\nTIKTOK",
            "strip": "TỪ Ý TƯỞNG → ĐĂNG BÀI",
            "subtitle": "Bắt trend • Viết script • Tạo video • Tự động hóa",
            "footer": "Dành cho creator mới bắt đầu với AI",
            "hashtags": "#AI #ContentCreator #TikTokTips",
        },
        "steps": {
            "bg": (8, 12, 28),
            "accent": (0, 229, 255),
            "accent2": (88, 101, 242),
            "badge": "AI GUIDE",
            "title": "5 BƯỚC\nDÙNG AI\nĐÚNG CÁCH",
            "strip": "TỪ BẢN NHÁP → CONTENT CÓ CHẤT RIÊNG",
            "subtitle": "Creator mới nên biết trước khi đăng bài",
            "footer": "Đừng copy output AI nguyên xi",
            "hashtags": "#CreatorMoi #DungAIThongMinh #TikTokTips",
        },
        "mistakes": {
            "bg": (18, 3, 8),
            "accent": (255, 71, 87),
            "accent2": (255, 184, 0),
            "badge": "AI TIPS",
            "title": "3 SAI\nLẦM KHI\nDÙNG AI",
            "strip": "COPY OUTPUT = CONTENT NHẠT",
            "subtitle": "Đừng để AI làm mất chất riêng của bạn",
            "footer": "Creator mới nên tránh trước khi đăng",
            "hashtags": "#AITips #CreatorMới #TikTokTips",
        },
    }

    if mode in presets:
        return presets[mode]

    colors = palette_from_topic(mode)
    return {
        **colors,
        "badge": "AI CREATOR",
        "title": split_title_lines(mode.replace("|", " ")),
        "strip": "AI CHO CREATOR",
        "subtitle": "Học cách dùng AI làm content hiệu quả hơn",
        "footer": shorten(mode.replace("|", " "), 70),
        "hashtags": "#AI #ContentCreator #TikTokTips",
    }


def extract_video_frame(video_path):
    if not os.path.exists(video_path):
        return None

    temp_file = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    temp_file.close()

    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                video_path,
                "-vframes",
                "1",
                "-q:v",
                "2",
                temp_file.name,
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0 or not os.path.exists(temp_file.name):
            return None
        return temp_file.name
    except Exception:
        return None


def create_cover(input_path, output_path, mode="automation"):
    palette = load_script_palette(mode)
    base = fit_cover(Image.open(input_path))
    base = base.filter(ImageFilter.GaussianBlur(5))

    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    bg_color = palette["bg"]
    accent = palette["accent"]
    accent2 = palette["accent2"]

    for y in range(HEIGHT):
        alpha = int(90 + 135 * (y / HEIGHT))
        draw.line((0, y, WIDTH, y), fill=(bg_color[0], bg_color[1], bg_color[2], alpha))

    draw.ellipse((-250, 180, 420, 850), fill=(accent2[0], accent2[1], accent2[2], 88))
    draw.ellipse((700, 900, 1350, 1600), fill=(accent[0], accent[1], accent[2], 72))

    badge_font = find_font(42, bold=True)
    title_font = find_font(106, bold=True)
    sub_font = find_font(48, bold=False)
    small_font = find_font(34, bold=False)

    badge_text = palette["badge"]
    bx, by = 86, 230
    bw, bh = 330, 78
    draw.rounded_rectangle((bx, by, bx + bw, by + bh), radius=38, fill=(255, 255, 255, 42), outline=(accent[0], accent[1], accent[2], 190), width=3)
    draw.text((bx + 34, by + 15), badge_text, font=badge_font, fill=(255, 255, 255, 255))

    title = palette["title"]
    title_w, title_h = text_dimensions(draw, title, title_font, spacing=16, stroke_width=5)
    title_x = 86
    title_y = 420
    draw.multiline_text(
        (title_x, title_y),
        title,
        font=title_font,
        fill=(255, 255, 255, 255),
        spacing=16,
        stroke_width=6,
        stroke_fill=(25, 6, 35, 255),
    )

    strip_y = title_y + title_h + 56
    draw.rounded_rectangle((86, strip_y, 994, strip_y + 132), radius=34, fill=(accent[0], accent[1], accent[2], 220))
    draw.text((126, strip_y + 26), palette["strip"], font=sub_font, fill=(10, 8, 20, 255))

    subtitle = palette["subtitle"]
    wrapped = wrap_text(draw, subtitle, sub_font, 880)
    sw, sh = text_dimensions(draw, wrapped, sub_font, spacing=12, stroke_width=3)
    sy = strip_y + 190
    draw.multiline_text(
        ((WIDTH - sw) // 2, sy),
        wrapped,
        font=sub_font,
        fill=(255, 255, 255, 245),
        spacing=12,
        align="center",
        stroke_width=3,
        stroke_fill=(0, 0, 0, 180),
    )

    panel_y = 1540
    draw.rounded_rectangle((76, panel_y, WIDTH - 76, panel_y + 178), radius=42, fill=(0, 0, 0, 150), outline=(255, 255, 255, 72), width=2)
    draw.text((126, panel_y + 34), palette["footer"], font=small_font, fill=(255, 255, 255, 235))
    draw.text((126, panel_y + 92), palette["hashtags"], font=small_font, fill=(accent[0], accent[1], accent[2], 255))

    result = Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    result.save(output_path, "PNG")
    print(output_path)


def regen_post_covers(posts_dir):
    for folder in sorted(os.listdir(posts_dir)):
        post_path = os.path.join(posts_dir, folder)
        if not os.path.isdir(post_path):
            continue

        meta_path = os.path.join(post_path, "meta.json")
        cover_path = os.path.join(post_path, "cover.png")
        video_path = os.path.join(post_path, "video.mp4")
        scenes_path = os.path.join(post_path, "scenes.json")

        if not os.path.exists(meta_path) or not os.path.exists(video_path):
            continue

        with open(meta_path, "r", encoding="utf-8") as handle:
            meta = json.load(handle)

        if os.path.exists(scenes_path):
            mode = scenes_path
        else:
            topic = meta.get("topic", folder)
            synthetic = {
                "topic": topic,
                "scenes": [
                    {
                        "title": topic.split(":")[0] if ":" in topic else topic[:48],
                        "body": topic,
                    }
                ],
            }
            mode = os.path.join(post_path, ".cover-script.json")
            with open(mode, "w", encoding="utf-8") as handle:
                json.dump(synthetic, handle, ensure_ascii=False, indent=2)

        frame_path = extract_video_frame(video_path)
        input_path = frame_path or os.path.join(os.getcwd(), "images", "overlays", "scene_1.png")
        create_cover(input_path, cover_path, mode)

        if frame_path and os.path.exists(frame_path):
            os.remove(frame_path)
        temp_script = os.path.join(post_path, ".cover-script.json")
        if os.path.exists(temp_script):
            os.remove(temp_script)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--regen-all":
        posts_dir = sys.argv[2] if len(sys.argv) > 2 else "storage/videos/posts"
        regen_post_covers(posts_dir)
        sys.exit(0)

    input_path = sys.argv[1] if len(sys.argv) > 1 else "images/overlays/scene_1.png"
    output_path = sys.argv[2] if len(sys.argv) > 2 else "storage/videos/cover.png"
    mode = sys.argv[3] if len(sys.argv) > 3 else "automation"
    create_cover(input_path, output_path, mode)
