#!/usr/bin/env python3
"""Dump cut PNG frames as line-wrapped hex modules for a GitHub text clone."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WIDTH = 64
# Keep each hex module small enough for GitHub Contents + MCP text push.
MAX_HEX_CHARS = 64 * 720  # 46080 hex chars ≈ 23 KB of PNG

FRAMES = [
    ("src/assets/concept-a/board/radish-portrait.png", "../../pngHex.ts"),
    ("src/assets/concept-a/board/radish-body.png", "../../pngHex.ts"),
    ("src/assets/concept-a/board/radish-walk-0.png", "../../pngHex.ts"),
    ("src/assets/concept-a/board/radish-walk-1.png", "../../pngHex.ts"),
    ("src/assets/concept-a/board/radish-walk-2.png", "../../pngHex.ts"),
    ("src/assets/concept-a/chili-idle-smile.png", "../pngHex.ts"),
    ("src/assets/concept-a/chili-idle-teeter.png", "../pngHex.ts"),
    ("src/assets/concept-a/chili-idle-smirk.png", "../pngHex.ts"),
    ("src/assets/concept-a/chili-walk-0.png", "../pngHex.ts"),
    ("src/assets/concept-a/chili-walk-1.png", "../pngHex.ts"),
    ("src/assets/concept-a/chili-walk-2.png", "../pngHex.ts"),
    ("src/assets/concept-a/chili-portrait.png", "../pngHex.ts"),
]


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
    for rel, decoder_import in FRAMES:
        png_path = ROOT / rel
        raw = png_path.read_bytes()
        hexstr = raw.hex()
        stem = png_path.with_suffix("")
        chunks = [hexstr[i : i + MAX_HEX_CHARS] for i in range(0, len(hexstr), MAX_HEX_CHARS)]
        hex_names: list[str] = []
        if len(chunks) == 1:
            hex_path = Path(str(stem) + ".hex.ts")
            write_hex_module(hex_path, chunks[0])
            hex_names.append("./" + hex_path.name)
            print(f"{hex_path.relative_to(ROOT)}  {len(chunks[0])} hex")
        else:
            for i, chunk in enumerate(chunks):
                hex_path = Path(str(stem) + f".hex.{i:02d}.ts")
                write_hex_module(hex_path, chunk)
                hex_names.append("./" + hex_path.name)
                print(f"{hex_path.relative_to(ROOT)}  {len(chunk)} hex")
        data_path = Path(str(stem) + ".data.ts")
        write_wrapper(data_path, decoder_import, hex_names)
        # Round-trip check
        dumped = "".join(chunks)
        assert dumped == hexstr
        print(f"{data_path.relative_to(ROOT)}  {len(raw)} png bytes  {len(chunks)} chunk(s)")


if __name__ == "__main__":
    main()
