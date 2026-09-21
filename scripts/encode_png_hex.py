#!/usr/bin/env python3
"""Dump cut PNG frames as small hex modules a GitHub text clone can load.

GitHub MCP transcribes ~10KB ASCII files faithfully and mutates larger ones.
256-color PNG is visually the same painting and keeps each module in that band.
Original RGBA cuts stay on disk for recut.
"""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WIDTH = 64
# ~9KB source files. 10KB already survived an exact GitHub SHA match.
MAX_HEX_CHARS = 64 * 140  # 8960 hex chars ≈ 4.5 KB of PNG

FRAMES = [
    ("src/assets/concept-a/board/radish-portrait.png", "../../pngHex.ts"),
    ("src/assets/concept-a/board/radish-body.png", "../../pngHex.ts"),
    ("src/assets/concept-a/board/radish-walk-0.png", "../../pngHex.ts"),
    ("src/assets/concept-a/board/radish-walk-1.png", "../../pngHex.ts"),
    ("src/assets/concept-a/board/radish-walk-2.png", "../../pngHex.ts"),
    ("src/assets/concept-a/board/chili-portrait.png", "../../pngHex.ts"),
    ("src/assets/concept-a/board/chili-body.png", "../../pngHex.ts"),
    ("src/assets/concept-a/chili-idle-smile.png", "../pngHex.ts"),
    ("src/assets/concept-a/chili-idle-teeter.png", "../pngHex.ts"),
    ("src/assets/concept-a/chili-idle-smirk.png", "../pngHex.ts"),
    ("src/assets/concept-a/chili-walk-0.png", "../pngHex.ts"),
    ("src/assets/concept-a/chili-walk-1.png", "../pngHex.ts"),
    ("src/assets/concept-a/chili-walk-2.png", "../pngHex.ts"),
    ("src/assets/concept-a/chili-portrait.png", "../pngHex.ts"),
]


def quantize_png(raw_path: Path) -> bytes:
    im = Image.open(raw_path).convert("RGBA")
    q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
    buf = io.BytesIO()
    q.save(buf, format="PNG", optimize=True, compress_level=9)
    return buf.getvalue()


def wrap_hex(hexstr: str) -> str:
    lines = [hexstr[i : i + WIDTH] for i in range(0, len(hexstr), WIDTH)]
    return "\n".join(lines)


def write_hex_module(path: Path, hexstr: str) -> None:
    body = "export default `\n" + wrap_hex(hexstr) + "\n`\n"
    path.write_text(body, encoding="ascii")


def write_wrapper(data_path: Path, decoder_import: str, hex_modules: list[str]) -> None:
    imports = [f"import {{ pngHexToDataUrl }} from '{decoder_import}'"]
    names: list[str] = []
    for i, rel in enumerate(hex_modules):
        name = f"hex{i}"
        names.append(name)
        imports.append(f"import {name} from '{rel}'")
    joined = names[0] if len(names) == 1 else f"[{', '.join(names)}].join('')"
    text = "\n".join(imports) + f"\n\nexport default pngHexToDataUrl({joined})\n"
    data_path.write_text(text, encoding="ascii")


def main() -> None:
    keep: set[Path] = set()
    for rel, decoder_import in FRAMES:
        png_path = ROOT / rel
        raw = quantize_png(png_path)
        hexstr = raw.hex()
        stem = png_path.with_suffix("")
        chunks = [hexstr[i : i + MAX_HEX_CHARS] for i in range(0, len(hexstr), MAX_HEX_CHARS)]
        hex_names: list[str] = []
        for i, chunk in enumerate(chunks):
            hex_path = Path(str(stem) + f".hex.{i:02d}.ts")
            write_hex_module(hex_path, chunk)
            hex_names.append("./" + hex_path.name)
            keep.add(hex_path)
            print(f"{hex_path.relative_to(ROOT)}  {len(chunk)} hex  {len(chunk)//2} png-bytes")
        data_path = Path(str(stem) + ".data.ts")
        write_wrapper(data_path, decoder_import, hex_names)
        keep.add(data_path)
        print(f"{data_path.relative_to(ROOT)}  {len(raw)} q256 png  {len(chunks)} chunk(s)")

    for hex_path in (ROOT / "src/assets").rglob("*.hex*.ts"):
        if hex_path not in keep:
            hex_path.unlink()
            print("removed", hex_path.relative_to(ROOT))


if __name__ == "__main__":
    main()
