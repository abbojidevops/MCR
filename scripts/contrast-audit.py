#!/usr/bin/env python3
"""WCAG contrast audit for MCR access, dashboard, and operator surfaces.

The palette is read from the installed Tailwind CSS theme so the audit follows
the exact Tailwind version used by the app instead of keeping a stale, manually
copied colour table. Tailwind 4 stores its default palette as OKLCH tokens; this
script converts those tokens to sRGB before applying the WCAG relative-luminance
formula.

The source scan pairs solid `text-*` and `bg-*` classes when they appear in the
same literal `className`. Dynamic class expressions are skipped because their
actual colour pair cannot be inferred safely from source text alone.
"""

import math
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THEME_CSS = os.path.join(ROOT, "node_modules", "tailwindcss", "theme.css")


def oklch_to_hex(value):
    """Convert Tailwind's `oklch(L C H)` theme token to clipped sRGB hex."""
    match = re.fullmatch(
        r"\s*([+-]?[\d.]+%?)\s+([+-]?[\d.]+|none)\s+([+-]?[\d.]+|none)\s*",
        value,
    )
    if not match:
        raise ValueError(f"Unsupported OKLCH token: {value!r}")

    lightness, chroma, hue = match.groups()
    l = float(lightness[:-1]) / 100 if lightness.endswith("%") else float(lightness)
    c = 0.0 if chroma == "none" else float(chroma)
    h = 0.0 if hue == "none" else math.radians(float(hue))

    a = c * math.cos(h)
    b = c * math.sin(h)
    l_ = l + 0.3963377774 * a + 0.2158037573 * b
    m_ = l - 0.1055613458 * a - 0.0638541728 * b
    s_ = l - 0.0894841775 * a - 1.2914855480 * b
    l3, m3, s3 = l_**3, m_**3, s_**3

    linear_rgb = (
        4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
        -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
        -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3,
    )

    def to_srgb(channel):
        channel = max(0.0, min(1.0, channel))
        encoded = 12.92 * channel if channel <= 0.0031308 else 1.055 * channel ** (1 / 2.4) - 0.055
        return round(encoded * 255)

    return "#" + "".join(f"{to_srgb(channel):02x}" for channel in linear_rgb)


def parse_hex(value):
    value = value.strip().lower()
    if re.fullmatch(r"#[0-9a-f]{3}", value):
        return "#" + "".join(char * 2 for char in value[1:])
    if re.fullmatch(r"#[0-9a-f]{6}", value):
        return value
    return None


def load_tailwind_palette():
    if not os.path.isfile(THEME_CSS):
        raise FileNotFoundError(
            f"Tailwind theme not found at {THEME_CSS}. Run `npm ci` before the contrast audit."
        )

    source = open(THEME_CSS, encoding="utf-8").read()
    palette = {}
    token_pattern = re.compile(
        r"--color-([a-z]+)-(\d{2,3}):\s*oklch\(([^)]+)\)", re.IGNORECASE
    )
    for name, shade, value in token_pattern.findall(source):
        palette.setdefault(name.lower(), {})[int(shade)] = oklch_to_hex(value)

    named = {"transparent": None, "current": None, "inherit": None}
    named_pattern = re.compile(r"--color-(white|black):\s*([^;]+);", re.IGNORECASE)
    for name, value in named_pattern.findall(source):
        named[name.lower()] = parse_hex(value)

    if not palette or not named.get("white") or not named.get("black"):
        raise ValueError("Could not read Tailwind's default colour tokens from theme.css")
    return palette, named


def resolve_class(cls, palette, named):
    """Resolve a solid Tailwind text/background class to hex, or None."""
    match = re.match(r"^(text|bg)-([a-z]+)-(\d{2,3})$", cls)
    if match:
        _, name, shade = match.groups()
        return palette.get(name, {}).get(int(shade))

    match = re.match(r"^(text|bg)-([a-z]+)$", cls)
    if match and match.group(2) in named:
        return named[match.group(2)]
    return None


def hex_to_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def relative_luminance(rgb):
    def linearize(channel):
        channel /= 255.0
        return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4

    red, green, blue = (linearize(channel) for channel in rgb)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast(foreground, background):
    first = relative_luminance(hex_to_rgb(foreground))
    second = relative_luminance(hex_to_rgb(background))
    lighter, darker = max(first, second), min(first, second)
    return (lighter + 0.05) / (darker + 0.05)


# className="..." values, including template literals with ${} inside.
CLASS_STRING = re.compile(r'className=(?:"([^"]*)"|\{`([^`]*)`\}|\{\'([^\']*)\'\})')


def find_files():
    files = []
    for base in (
        "src/app/admin",
        "src/app/dashboard",
        "src/app/operator-login",
        "src/app/login",
        "src/app/onboarding",
        "src/app/page.tsx",
        "src/components",
        "src/app/not-found.tsx",
    ):
        path = os.path.join(ROOT, base)
        if not os.path.exists(path):
            continue
        if os.path.isfile(path):
            files.append(path)
            continue
        for directory, _subdirectories, names in os.walk(path):
            files.extend(
                os.path.join(directory, name)
                for name in names
                if name.endswith((".tsx", ".ts"))
            )
    return sorted(files)


def main():
    try:
        palette, named = load_tailwind_palette()
    except (OSError, ValueError) as error:
        print(f"Contrast audit could not load the Tailwind palette: {error}", file=sys.stderr)
        return 2

    files = find_files()
    print(f"Scanning {len(files)} files using Tailwind CSS 4 theme tokens\n")
    failures = []
    checked = 0

    for path in files:
        relative_path = os.path.relpath(path, ROOT)
        source = open(path, encoding="utf-8").read()

        for match in CLASS_STRING.finditer(source):
            value = match.group(1) or match.group(2) or match.group(3) or ""
            if "${" in value:
                continue

            classes = value.split()
            foregrounds = [
                resolve_class(class_name, palette, named)
                for class_name in classes
                if class_name.startswith("text-")
            ]
            backgrounds = [
                resolve_class(class_name, palette, named)
                for class_name in classes
                if class_name.startswith("bg-")
            ]
            foreground = next((color for color in foregrounds if color), None)
            background = next((color for color in backgrounds if color), None)
            if not foreground or not background:
                continue

            line = source[:match.start()].count("\n") + 1
            checked += 1

            # Icon-only tiles are graphical objects (WCAG 1.4.11, 3:1); other
            # text requires 4.5:1 under WCAG 1.4.3.
            body = source[match.end():match.end() + 400]
            after_tag = re.sub(r"^\s*>", "", body)
            icon_only = bool(
                re.match(r"\s*<[A-Z][A-Za-z0-9]*\s+className=\"[^\"]*\"", after_tag)
            )
            threshold = 3.0 if icon_only else 4.5
            ratio = contrast(foreground, background)
            if ratio < threshold:
                failures.append(
                    (relative_path, line, foreground, background, round(ratio, 2), classes, threshold, icon_only)
                )

    print(f"Measurable text-on-background pairs: {checked}")
    print("  (text judged at 4.5:1 per WCAG 1.4.3; icon-only tiles at 3:1 per 1.4.11)")

    if not failures:
        print("\nNo failing pairs.")
        return 0

    print(f"\n{len(failures)} pair(s) below their threshold:\n")
    for relative_path, line, foreground, background, ratio, classes, threshold, icon_only in failures:
        kind = "icon (1.4.11, needs 3:1)" if icon_only else "text (1.4.3, needs 4.5:1)"
        print(f"  {relative_path}:{line}  {kind}")
        print(f"    {foreground} on {background} -> {ratio}:1")
        print(f"    classes: {' '.join(classes)}\n")
    return 1


if __name__ == "__main__":
    sys.exit(main())
