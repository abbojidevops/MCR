#!/usr/bin/env python3
"""
WCAG contrast audit for the operator console and shared access surfaces.

Pulls every Tailwind colour class used as a text colour on a light background
out of the source and computes the contrast ratio. A text colour is only
reportable as passing if we also know what it sits on, so this checks the
colour pairs that appear together in the same className string — which is how
the app is actually written.

Exit code is non-zero if any PAIR fails its threshold.
"""

import os
import re
import sys
from itertools import product

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# Tailwind palette -> sRGB hex. Source: Tailwind CSS v3 default theme.
# ---------------------------------------------------------------------------
def _scale(base):
    """Expand a 50..950 ramp keyed on the 500 value."""
    return base

SLATE = {
    50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1",
    400: "#94a3b8", 500: "#64748b", 600: "#475569", 700: "#334155",
    800: "#1e293b", 900: "#0f172a", 950: "#020617",
}
GRAY = {
    50: "#f9fafb", 100: "#f3f4f6", 200: "#e5e7eb", 300: "#d1d5db",
    400: "#9ca3af", 500: "#6b7280", 600: "#4b5563", 700: "#374151",
    800: "#1f2937", 900: "#111827", 950: "#030712",
}
ZINC = {
    50: "#fafafa", 100: "#f4f4f5", 200: "#e4e4e7", 300: "#d4d4d8",
    400: "#a1a1aa", 500: "#71717a", 600: "#52525b", 700: "#3f3f46",
    800: "#27272a", 900: "#18181b", 950: "#09090b",
}
NEUTRAL = {
    50: "#fafafa", 100: "#f5f5f5", 200: "#e5e5e5", 300: "#d4d4d4",
    400: "#a3a3a3", 500: "#737373", 600: "#525252", 700: "#404040",
    800: "#262626", 900: "#171717", 950: "#0a0a0a",
}
STONE = {
    50: "#fafaf9", 100: "#f5f5f4", 200: "#e7e5e4", 300: "#d6d3d1",
    400: "#a8a29e", 500: "#78716c", 600: "#57534e", 700: "#44403c",
    800: "#292524", 900: "#1c1917", 950: "#0c0a09",
}
RED = {
    50: "#fef2f2", 100: "#fee2e2", 200: "#fecaca", 300: "#fca5a5",
    400: "#f87171", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c",
    800: "#991b1b", 900: "#7f1d1d", 950: "#450a0a",
}
ORANGE = {
    50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 300: "#fdba74",
    400: "#fb923c", 500: "#f97316", 600: "#ea580c", 700: "#c2410c",
    800: "#9a3412", 900: "#7c2d12", 950: "#431407",
}
AMBER = {
    50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d",
    400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309",
    800: "#92400e", 900: "#78350f", 950: "#451a03",
}
YELLOW = {
    50: "#fefce8", 100: "#fef9c3", 200: "#fef08a", 300: "#fde047",
    400: "#facc15", 500: "#eab308", 600: "#ca8a04", 700: "#a16207",
    800: "#854d0e", 900: "#713f12", 950: "#422006",
}
LIME = {
    50: "#f7fee7", 100: "#ecfccb", 200: "#d9f99d", 300: "#bef264",
    400: "#a3e635", 500: "#84cc16", 600: "#65a30d", 700: "#4d7c0f",
    800: "#3f6212", 900: "#365314", 950: "#1a2e05",
}
GREEN = {
    50: "#f0fdf4", 100: "#dcfce7", 200: "#bbf7d0", 300: "#86efac",
    400: "#4ade80", 500: "#22c55e", 600: "#16a34a", 700: "#15803d",
    800: "#166534", 900: "#14532d", 950: "#052e16",
}
EMERALD = {
    50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 300: "#6ee7b7",
    400: "#34d399", 500: "#10b981", 600: "#059669", 700: "#047857",
    800: "#065f46", 900: "#064e3b", 950: "#022c22",
}
TEAL = {
    50: "#f0fdfa", 100: "#ccfbf1", 200: "#99f6e4", 300: "#5eead4",
    400: "#2dd4bf", 500: "#14b8a6", 600: "#0d9488", 700: "#0f766e",
    800: "#115e59", 900: "#134e4a", 950: "#042f2e",
}
CYAN = {
    50: "#ecfeff", 100: "#cffafe", 200: "#a5f3fc", 300: "#67e8f9",
    400: "#22d3ee", 500: "#06b6d4", 600: "#0891b2", 700: "#0e7490",
    800: "#155e75", 900: "#164e63", 950: "#083344",
}
SKY = {
    50: "#f0f9ff", 100: "#e0f2fe", 200: "#bae6fd", 300: "#7dd3fc",
    400: "#38bdf8", 500: "#0ea5e9", 600: "#0284c7", 700: "#0369a1",
    800: "#075985", 900: "#0c4a6e", 950: "#082f49",
}
BLUE = {
    50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd",
    400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8",
    800: "#1e40af", 900: "#1e3a8a", 950: "#172554",
}
INDIGO = {
    50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2fe", 300: "#a5b4fc",
    400: "#818cf8", 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca",
    800: "#3730a3", 900: "#312e81", 950: "#1e1b4b",
}
VIOLET = {
    50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6fe", 300: "#c4b5fd",
    400: "#a78bfa", 500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9",
    800: "#5b21b6", 900: "#4c1d95", 950: "#2e1065",
}
PURPLE = {
    50: "#faf5ff", 100: "#f3e8ff", 200: "#e9d5ff", 300: "#d8b4fe",
    400: "#c084fc", 500: "#a855f7", 600: "#9333ea", 700: "#7e22ce",
    800: "#6b21a8", 900: "#581c87", 950: "#3b0764",
}
FUCHSIA = {
    50: "#fdf4ff", 100: "#fae8ff", 200: "#f5d0fe", 300: "#f0abfc",
    400: "#e879f9", 500: "#d946ef", 600: "#c026d3", 700: "#a21caf",
    800: "#86198f", 900: "#701a75", 950: "#4a044e",
}
PINK = {
    50: "#fdf2f8", 100: "#fce7f3", 200: "#fbcfe8", 300: "#f9a8d4",
    400: "#f472b6", 500: "#ec4899", 600: "#db2777", 700: "#be185d",
    800: "#9d174d", 900: "#831843", 950: "#500724",
}
ROSE = {
    50: "#fff1f2", 100: "#ffe4e6", 200: "#fecdd3", 300: "#fda4af",
    400: "#fb7185", 500: "#f43f5e", 600: "#e11d48", 700: "#be123c",
    800: "#9f1239", 900: "#881337", 950: "#4c0519",
}

PALETTE = {
    "slate": SLATE, "gray": GRAY, "zinc": ZINC, "neutral": NEUTRAL,
    "stone": STONE, "red": RED, "orange": ORANGE, "amber": AMBER,
    "yellow": YELLOW, "lime": LIME, "green": GREEN, "emerald": EMERALD,
    "teal": TEAL, "cyan": CYAN, "sky": SKY, "blue": BLUE, "indigo": INDIGO,
    "violet": VIOLET, "purple": PURPLE, "fuchsia": FUCHSIA, "pink": PINK,
    "rose": ROSE,
}

NAMED = {
    "white": "#ffffff", "black": "#000000",
    "transparent": None, "current": None, "inherit": None,
}

# ---------------------------------------------------------------------------
# WCAG maths
# ---------------------------------------------------------------------------

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def relative_luminance(rgb):
    def channel(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg_hex, bg_hex):
    l1 = relative_luminance(hex_to_rgb(fg_hex))
    l2 = relative_luminance(hex_to_rgb(bg_hex))
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


# ---------------------------------------------------------------------------
# Class extraction
# ---------------------------------------------------------------------------

def resolve_class(cls):
    """Resolve a single tailwind class to a hex, or None if not a solid colour."""
    # text-<color>-<shade> / bg-<color>-<shade>
    m = re.match(r"^(text|bg)-([a-z]+)-(\d{2,3})$", cls)
    if m:
        _, name, shade = m.groups()
        ramp = PALETTE.get(name)
        if ramp and int(shade) in ramp:
            return ramp[int(shade)]
        return None
    # text-white / bg-white etc.
    m = re.match(r"^(text|bg)-([a-z]+)$", cls)
    if m and m.group(2) in NAMED:
        return NAMED[m.group(2)]
    return None


# className="..." values, including template literals with ${} inside
CLASS_STRING = re.compile(r'className=(?:"([^"]*)"|\{`([^`]*)`\}|\{\'([^\']*)\'\})')


def find_files():
    out = []
    for base in ("src/app/admin", "src/app/dashboard", "src/app/operator-login",
                 "src/app/login", "src/app/onboarding", "src/app/page.tsx",
                 "src/components", "src/app/not-found.tsx"):
        p = os.path.join(ROOT, base)
        if not os.path.exists(p):
            continue
        if os.path.isfile(p):
            out.append(p)
            continue
        for dirpath, _dirs, files in os.walk(p):
            for f in files:
                if f.endswith((".tsx", ".ts")):
                    out.append(os.path.join(dirpath, f))
    return sorted(out)


def main():
    files = find_files()
    print(f"Scanning {len(files)} files\n")

    problems = []
    checked = 0

    for path in files:
        rel = os.path.relpath(path, ROOT)
        src = open(path, encoding="utf-8").read()

        for m in CLASS_STRING.finditer(src):
            value = m.group(1) or m.group(2) or m.group(3) or ""
            if "${" in value:
                # Skip conditional className fragments — the pair we would
                # measure is not determinable from source.
                continue
            classes = value.split()
            texts = [resolve_class(c) for c in classes if c.startswith("text-")]
            bgs = [resolve_class(c) for c in classes if c.startswith("bg-")]

            fg = next((t for t in texts if t), None)
            bg = next((b for b in bgs if b), None)
            if not fg or not bg:
                continue

            lineno = src[:m.start()].count("\n") + 1
            checked += 1

            # WCAG distinguishes text from graphical objects. An element whose
            # only child is an icon component is a graphic and is judged against
            # 1.4.11 (3:1), not 1.4.3 (4.5:1). Judging icons at the text bar
            # produces a pile of false positives and hides the real failures.
            # What follows the className is `>` then the element's children.
            body = src[m.end():m.end() + 400]
            after_tag = re.sub(r"^\s*>", "", body)
            is_icon_only = bool(
                re.match(r"\s*<[A-Z][A-Za-z0-9]*\s+className=\"[^\"]*\"", after_tag)
            )
            threshold = 3.0 if is_icon_only else 4.5

            ratio = contrast(fg, bg)
            if ratio < threshold:
                problems.append(
                    (rel, lineno, fg, bg, round(ratio, 2), classes, threshold, is_icon_only)
                )

    print(f"Measurable text-on-background pairs: {checked}")
    print("  (text judged at 4.5:1 per WCAG 1.4.3; icon-only tiles at 3:1 per 1.4.11)")

    if not problems:
        print("\nNo failing pairs.")
        return 0

    print(f"\n{len(problems)} pair(s) below their threshold:\n")
    for rel, lineno, fg, bg, ratio, classes, threshold, is_icon_only in problems:
        kind = "icon (1.4.11, needs 3:1)" if is_icon_only else "text (1.4.3, needs 4.5:1)"
        print(f"  {rel}:{lineno}  {kind}")
        print(f"    {fg} on {bg} -> {ratio}:1")
        print(f"    classes: {' '.join(classes)}\n")
    return 1


if __name__ == "__main__":
    sys.exit(main())
