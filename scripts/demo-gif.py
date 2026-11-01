"""Renders demo.gif from a real run. Usage: python3 scripts/demo-gif.py <dir with JetBrainsMono TTFs> demo.gif"""
import sys
from PIL import Image, ImageDraw, ImageFont

FONT_DIR = sys.argv[1]
OUT = sys.argv[2]
W, H, PAD, SIZE, LINE = 880, 470, 28, 15, 24
BG, FG, DIM, GREEN, BLUE, YELLOW = "#0f1115", "#e6e6e6", "#7d8590", "#7ee787", "#79c0ff", "#e3b341"
regular = ImageFont.truetype(f"{FONT_DIR}/JetBrainsMono-Regular.ttf", SIZE)
bold = ImageFont.truetype(f"{FONT_DIR}/JetBrainsMono-Bold.ttf", SIZE)

# (text, color, bold, typed): typed lines appear character by character
SCRIPT = [
    ("$ claude mcp add onchain-stocks -e TOKENS_API_KEY=… -- npx -y onchain-stocks-mcp", FG, False, True),
    ("", FG, False, False),
    ("> How does tokenized Tesla compare to the real share", FG, True, True),
    ("  for a $1,000 buy?", FG, True, True),
    ("", FG, False, False),
    ("  onchain-stocks · compare_issuers(symbol: \"TSLA\", usd: 1000)", BLUE, False, False),
    ("", FG, False, False),
    ("  Real TSLA share   $400.21   Friday close, market shut", FG, True, False),
    ("", FG, False, False),
    ("  Token             You pay   vs share", DIM, False, False),
    ("  Backed xStock     $399.63    -0.14%", GREEN, False, False),
    ("  Backpack          $400.09    -0.03%", GREEN, False, False),
    ("  Ondo              $571.53   +42.81%   thin Jupiter route", YELLOW, False, False),
    ("", FG, False, False),
    ("  Price per token, Jupiter quotes not fills. Measured 2026-11-01.", DIM, False, False),
    ("  Not investment advice.", DIM, False, False),
]


def render(lines, cursor):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for i, c in enumerate(["#ff5f57", "#febc2e", "#28c840"]):
        d.ellipse((PAD + i * 20, 14, PAD + i * 20 + 11, 25), fill=c)
    d.text((W // 2, 19), "onchain-stocks-mcp", fill=DIM, font=regular, anchor="mm")
    y = 48
    for text, color, is_bold, _ in lines:
        d.text((PAD, y), text, fill=color, font=bold if is_bold else regular)
        y += LINE
    if cursor:
        last = lines[-1] if lines else ("", FG, False, False)
        x = PAD + d.textlength(last[0], font=bold if last[2] else regular)
        d.rectangle((x + 2, y - LINE + 3, x + 10, y - 4), fill=FG)
    return img


frames, durations = [], []
shown = []
for text, color, is_bold, typed in SCRIPT:
    if typed:
        for n in range(0, len(text) + 1, 3):
            frames.append(render(shown + [(text[:n], color, is_bold, typed)], True))
            durations.append(40)
        durations[-1] = 350
    shown.append((text, color, is_bold, typed))
    if not typed:
        frames.append(render(shown, False))
        durations.append(500 if text else 150)
frames.append(render(shown, False))
durations.append(4000)
frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)
print(f"{len(frames)} frames -> {OUT}")
