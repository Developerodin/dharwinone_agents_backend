#!/usr/bin/env python3
"""Process Gemini scene stills for pf_blog_scroll_v1 → 3:2 JPEG at 1920×1280."""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = Path(
    os.environ.get(
        "CURSOR_IMAGES_DIR",
        Path.home()
        / "AppData/Roaming/Cursor/User/workspaceStorage/ce3755c2eceb526e0b348f5df921349f/images",
    )
)
OUT_DIR = (
    ROOT
    / "frontend-separate/dharwinone_agents_frontend/src/templates/launch/pf_blog_scroll_v1/assets/scenes"
)
TARGET_W, TARGET_H = 1920, 1280
QUALITY = 90

SCENES: list[tuple[str, str, bool]] = [
    ("desk.jpg", "image-d947d268-be20-494f-8ac8-3d18864dbcf7.png", True),
    ("draft.jpg", "image-3ca6e6da-7711-4cce-a6f7-8f6e82b49fb2.png", False),
    ("published.jpg", "image-5bf1ddff-dbeb-48fd-b5f5-a4c677498c33.png", False),
    ("readers.jpg", "image-64209b7d-c993-4e9d-b88c-7fc59a977628.png", False),
    ("archive.jpg", "image-467a520a-58cf-4273-b68a-9cf9c692b8d8.png", False),
    ("newsletter.jpg", "image-cd064ff2-0856-4f14-b544-ddfc8046ef09.png", False),
]


def center_crop_3_2(img: Image.Image) -> Image.Image:
    w, h = img.size
    target_ratio = TARGET_W / TARGET_H
    current_ratio = w / h
    if current_ratio > target_ratio:
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        box = (left, 0, left + new_w, h)
    else:
        new_h = int(w / target_ratio)
        top = (h - new_h) // 2
        box = (0, top, w, top + new_h)
    return img.crop(box).resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)


def patch_watermark(img: Image.Image) -> Image.Image:
    """Crop ~3% from bottom-right to remove Gemini watermark."""
    w, h = img.size
    crop_w = int(w * 0.97)
    crop_h = int(h * 0.97)
    return img.crop((0, 0, crop_w, crop_h))


def process_scene(out_name: str, src_name: str, patch_logo: bool) -> dict:
    src = SOURCE_DIR / src_name
    if not src.is_file():
        raise FileNotFoundError(f"Missing source: {src}")
    img = Image.open(src).convert("RGB")
    if patch_logo:
        img = patch_watermark(img)
    img = center_crop_3_2(img)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dest = OUT_DIR / out_name
    img.save(dest, "JPEG", quality=QUALITY, optimize=True)
    return {"out": str(dest), "bytes": dest.stat().st_size, "size": img.size}


def main() -> None:
    print(f"Source: {SOURCE_DIR}")
    print(f"Output: {OUT_DIR}\n")
    for out_name, src_name, patch in SCENES:
        info = process_scene(out_name, src_name, patch)
        print(f"OK {out_name} <- {src_name}  {info['size']}  {info['bytes']:,} bytes")


if __name__ == "__main__":
    main()
