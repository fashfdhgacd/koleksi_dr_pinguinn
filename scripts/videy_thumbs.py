#!/usr/bin/env python3
"""Grab one frame per Videy video that has no thumbnail yet.

Reads every catalog JSON the site builds from, finds Videy items (cdn.videy.co file URL),
and writes public/videy-thumbs/<id>.jpg with ffmpeg. Existing files are never redone, so each
video is fetched from Videy once. A video that fails is retried on the next run.
"""
import glob
import json
import os
import re
import subprocess

OUT = "public/videy-thumbs"
SOURCES = sorted(set(glob.glob("data/videos*.json") + ["src/lib/catalog/videos.json"]))
ID_RE = re.compile(r"^[A-Za-z0-9]{4,40}$")
CDN_RE = re.compile(r"^https://cdn\d*\.videy\.co/([A-Za-z0-9]+)\.(mp4|mov)$", re.I)


def items_of(path):
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    if isinstance(data, dict):
        data = data.get("items") or data.get("videos") or []
    return data if isinstance(data, list) else []


def videy_files():
    found = {}
    for path in SOURCES:
        for it in items_of(path):
            if not isinstance(it, dict):
                continue
            for key in ("direct", "embed", "video_url"):
                m = CDN_RE.match(str(it.get(key) or "").strip())
                if m and ID_RE.match(m.group(1)):
                    found.setdefault(m.group(1), f"https://cdn.videy.co/{m.group(1)}.{m.group(2).lower()}")
                    break
    return found


def grab(url, dest):
    # Try a few points in the video: very dark intros are common, short clips need an early frame.
    for at in ("20", "8", "2", "0"):
        tmp = dest + ".tmp.jpg"
        cmd = [
            "ffmpeg", "-loglevel", "error", "-y", "-ss", at, "-i", url,
            "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", tmp,
        ]
        try:
            subprocess.run(cmd, check=True, timeout=90)
        except Exception:
            continue
        if os.path.exists(tmp) and os.path.getsize(tmp) > 3000:
            os.replace(tmp, dest)
            return True
        if os.path.exists(tmp):
            os.remove(tmp)
    return False


def main():
    os.makedirs(OUT, exist_ok=True)
    files = videy_files()
    made = failed = 0
    for vid, url in files.items():
        dest = os.path.join(OUT, f"{vid}.jpg")
        if os.path.exists(dest):
            continue
        if grab(url, dest):
            made += 1
        else:
            failed += 1
            print(f"no frame: {vid}")
    print(f"videy: {len(files)} total, {made} new thumbs, {failed} failed")


if __name__ == "__main__":
    main()
