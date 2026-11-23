"""Draws the Intent app icon set: "intent." in yellow, in the app's handwritten
font, on a strip of torn navy tape stuck on the app's cream paper (or white).

Usage: python3 scripts/make-icons.py apps/mobile [white|cream]  (white is the chosen one)
"""
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

MOBILE = Path(sys.argv[1])
ASSETS = MOBILE / "assets"
WEB = MOBILE / "public" / "icons"

# Gochi Hand: the font of the "fresh / dripping / last day" stage words.
FONT = str(
    Path(__file__).resolve().parent.parent
    / "node_modules/@expo-google-fonts/gochi-hand/400Regular/GochiHand_400Regular.ttf"
)

# Background: the Mirror and Kept page colour (colors.bg), or plain white.
BACKGROUNDS = {"cream": (242, 237, 230, 255), "white": (255, 255, 255, 255)}
BG = BACKGROUNDS[sys.argv[2] if len(sys.argv) > 2 else "white"]
TAPE = (27, 42, 74, 255)        # navy
TAPE_DARK = (226, 85, 26, 255)  # colors.orange: offset shadow under the letters
YELLOW = (246, 232, 44, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)

SS = 4  # supersampling for smooth edges
TILT = -6  # degrees: the tape sits a little crooked, like it was slapped on


def torn_edge(x, y0, y1, depth, rng, steps=26):
    """Points down a ragged vertical edge at x, tearing up to `depth` sideways."""
    pts = []
    for i in range(steps + 1):
        y = y0 + (y1 - y0) * i / steps
        pts.append((x + rng.uniform(-depth, depth), y))
    return pts


def tape_shape(w, h, seed=7):
    """Tape outline: straight long sides, torn short ends."""
    rng = random.Random(seed)
    depth = w * 0.018
    left = torn_edge(0, h, 0, depth, rng)
    right = torn_edge(w, 0, h, depth, rng)
    return left + right


def draw_tape(w, h, mono=None, seed=7):
    """One strip of tape with the word on it, on a transparent layer."""
    layer = Image.new("RGBA", (int(w), int(h)), CLEAR)
    d = ImageDraw.Draw(layer)
    d.polygon(tape_shape(w, h, seed), fill=mono or TAPE)

    if not mono:
        # Creases and paper grain so it reads as tape, not a flat box.
        rng = random.Random(seed + 1)
        grain = Image.new("L", layer.size, 0)
        gd = ImageDraw.Draw(grain)
        for _ in range(int(w * h / 900)):
            x, y = rng.uniform(0, w), rng.uniform(0, h)
            gd.point((x, y), fill=rng.randint(20, 60))
        crease = Image.new("L", layer.size, 0)
        cd = ImageDraw.Draw(crease)
        for _ in range(3):
            x0 = rng.uniform(0.15, 0.85) * w
            cd.line(
                [(x0, 0), (x0 + rng.uniform(-0.12, 0.12) * w, h)],
                fill=90,
                width=max(2, int(h * 0.02)),
            )
        crease = crease.filter(ImageFilter.GaussianBlur(h * 0.02))
        shade = ImageChops.add(grain, crease)
        light = Image.new("RGBA", layer.size, (190, 205, 240, 0))
        light.putalpha(shade)
        mask = layer.getchannel("A")
        light.putalpha(ImageChops.multiply(shade, mask))
        layer = Image.alpha_composite(layer, light)
        d = ImageDraw.Draw(layer)

    # The word, as large as fits with a margin.
    text = "intent."
    size = int(h * 0.92)
    font = ImageFont.truetype(FONT, size)
    while True:
        box = d.textbbox((0, 0), text, font=font)
        tw, th = box[2] - box[0], box[3] - box[1]
        if tw <= w * 0.82 and th <= h * 0.66:
            break
        size -= 2
        font = ImageFont.truetype(FONT, size)
    x = (w - tw) / 2 - box[0]
    y = (h - th) / 2 - box[1]
    if mono:
        # Monochrome: cut the word out of the tape.
        cut = Image.new("L", layer.size, 0)
        ImageDraw.Draw(cut).text((x, y), text, font=font, fill=255)
        alpha = ImageChops.subtract(layer.getchannel("A"), cut)
        layer.putalpha(alpha)
        return layer
    # Offset shadow like the reference lettering, then the yellow word.
    off = h * 0.035
    d.text((x - off, y + off * 0.4), text, font=font, fill=TAPE_DARK)
    d.text((x, y), text, font=font, fill=YELLOW)
    return layer


def render(px, bg, tape_frac, mono=None):
    s = px * SS
    canvas = Image.new("RGBA", (s, s), bg)
    w = s * tape_frac
    h = w * 0.42
    tape = draw_tape(w, h, mono)
    if not mono and bg != CLEAR:
        # Soft drop shadow so the tape lifts off the blue.
        sh = Image.new("RGBA", tape.size, (60, 30, 15, 0))
        sh.putalpha(tape.getchannel("A").point(lambda a: int(a * 0.22)))
        sh = sh.rotate(TILT, expand=True, resample=Image.BICUBIC)
        sh = sh.filter(ImageFilter.GaussianBlur(s * 0.012))
        canvas.alpha_composite(sh, ((s - sh.width) // 2, (s - sh.height) // 2 + int(s * 0.012)))
    tape = tape.rotate(TILT, expand=True, resample=Image.BICUBIC)
    canvas.alpha_composite(tape, ((s - tape.width) // 2, (s - tape.height) // 2))
    return canvas.resize((px, px), Image.LANCZOS)


def save(img, path, rgb=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    (img.convert("RGB") if rgb else img).save(path, optimize=True)
    print("wrote", path.relative_to(MOBILE), img.size)


# App icon (iOS and default): full background square, tape across ~84% of the width.
save(render(1024, BG, 0.84), ASSETS / "icon.png", rgb=True)
# Android adaptive icon: launchers crop to a circle or squircle, so the tape
# stays inside the central safe zone (~62% of the canvas).
save(render(512, CLEAR, 0.62), ASSETS / "android-icon-foreground.png")
save(Image.new("RGBA", (512, 512), BG), ASSETS / "android-icon-background.png")
save(render(432, CLEAR, 0.62, mono=WHITE), ASSETS / "android-icon-monochrome.png")
# Android notification icon: white tape with the word cut out.
save(render(96, CLEAR, 0.92, mono=WHITE), ASSETS / "notification-icon.png")
# Splash: the tape alone, cropped tight, so the launch screen and the app's
# 1.5 s intro can size it by width and match each other exactly.
splash = render(2048, CLEAR, 0.92)
save(splash.crop(splash.getbbox()), ASSETS / "splash-icon.png")
save(render(48, BG, 0.92), ASSETS / "favicon.png")
# Web app icons.
save(render(180, BG, 0.84), WEB / "apple-touch-icon.png", rgb=True)
save(render(192, BG, 0.84), WEB / "icon-192.png")
save(render(512, BG, 0.84), WEB / "icon-512.png")
save(render(512, BG, 0.62), WEB / "maskable-512.png")
