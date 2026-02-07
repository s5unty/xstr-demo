#!/usr/bin/env python3
"""从 cqkm.png 切分独立按键图与黄色提示图。"""

from pathlib import Path
from PIL import Image

SOURCE = Path('cqkm.png')
KEY_OUT = Path('assets/keyboard/keys')
ANNOTATION_OUT = Path('assets/keyboard/annotations')
YELLOW_MIN_R = 140
YELLOW_MIN_G = 130
YELLOW_MAX_B = 140
YELLOW_STRONG_R = 205
YELLOW_STRONG_G = 195
YELLOW_SOFT_B = 120

KEY_BOXES = {
    'q': (182, 83, 236, 136),
    'w': (250, 83, 304, 136),
    'e': (318, 83, 372, 136),
    'r': (384, 83, 440, 136),
    't': (453, 83, 509, 136),
    'y': (522, 84, 575, 136),
    'u': (590, 83, 643, 136),
    'i': (658, 83, 711, 136),
    'o': (726, 84, 779, 136),
    'p': (794, 83, 847, 136),
    'a': (200, 151, 254, 203),
    's': (268, 151, 322, 203),
    'd': (336, 151, 390, 203),
    'f': (404, 151, 458, 203),
    'g': (472, 151, 526, 203),
    'h': (540, 151, 594, 203),
    'j': (608, 150, 662, 203),
    'k': (676, 150, 731, 203),
    'l': (744, 150, 798, 203),
    'semicolon': (812, 151, 865, 203),
    'z': (234, 216, 287, 268),
    'x': (302, 216, 355, 268),
    'c': (370, 216, 423, 268),
    'v': (438, 216, 491, 268),
    'b': (506, 216, 559, 268),
    'n': (574, 216, 627, 268),
    'm': (641, 216, 696, 269),
    'comma': (710, 217, 763, 268),
    'period': (778, 217, 831, 268),
    'slash': (846, 216, 899, 268),
}

ANNOTATION_BOXES = {
    'zone-left-top': (82, 86, 180, 131),
    'zone-left-mid': (102, 154, 188, 201),
    'zone-left-bot': (129, 218, 218, 264),
    'zone-right-top': (866, 86, 953, 128),
    'zone-right-mid': (879, 154, 969, 199),
    'hints-bottom': (102, 300, 954, 330),
}


def save_slices(
    image: Image.Image,
    out_dir: Path,
    boxes: dict[str, tuple[int, int, int, int]],
    *,
    yellow_only: bool,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, (x1, y1, x2, y2) in boxes.items():
        patch = image.crop((x1, y1, x2 + 1, y2 + 1))
        if yellow_only:
            patch = keep_yellow_only(patch)
        patch.save(out_dir / f'{name}.png')


def keep_yellow_only(patch: Image.Image) -> Image.Image:
    rgba = patch.convert('RGBA')
    px = rgba.load()
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = px[x, y]
            if r < YELLOW_MIN_R or g < YELLOW_MIN_G or b > YELLOW_MAX_B:
                alpha = 0
            elif r >= YELLOW_STRONG_R and g >= YELLOW_STRONG_G and b <= YELLOW_SOFT_B:
                alpha = a
            else:
                # Keep anti-aliased yellow edges while dropping non-yellow background.
                y_strength = min((r - YELLOW_MIN_R) / (YELLOW_STRONG_R - YELLOW_MIN_R), 1.0)
                g_strength = min((g - YELLOW_MIN_G) / (YELLOW_STRONG_G - YELLOW_MIN_G), 1.0)
                b_strength = min((YELLOW_MAX_B - b) / (YELLOW_MAX_B - YELLOW_SOFT_B), 1.0)
                ratio = max(0.0, min(y_strength, g_strength, b_strength))
                alpha = int(a * ratio)
            px[x, y] = (r, g, b, alpha)
    return rgba


def main() -> None:
    image = Image.open(SOURCE).convert('RGBA')
    save_slices(image, KEY_OUT, KEY_BOXES, yellow_only=False)
    save_slices(image, ANNOTATION_OUT, ANNOTATION_BOXES, yellow_only=True)
    print(f'keys={len(KEY_BOXES)} annotations={len(ANNOTATION_BOXES)}')


if __name__ == '__main__':
    main()
