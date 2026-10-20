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
import time
import urllib.error
import urllib.request

OUT = "public/videy-thumbs"
SOURCES = sorted(set(glob.glob("data/videos*.json") + ["src/lib/catalog/videos.json"]))
ID_RE = re.compile(r"^[A-Za-z0-9]{4,40}$")
HIDDEN_FILE = "src/lib/catalog/hidden-ids.js"
DEAD_REASON = "dead-videy-mp4"
CDN_RE = re.compile(r"^https://cdn\d*\.videy\.co/([A-Za-z0-9]+)\.(mp4|mov)$", re.I)
# Videy mirror file (cdn2.aceimg.com/<id>.mp4): grabbed from that exact URL.
MIRROR_RE = re.compile(r"^https://cdn\d*\.aceimg\.com/([A-Za-z0-9]+)\.mp4$", re.I)


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
                if it.get("hidden"):
                    break
                if m and ID_RE.match(m.group(1)):
                    found.setdefault(m.group(1), f"https://cdn.videy.co/{m.group(1)}.{m.group(2).lower()}")
                    break
                mm = MIRROR_RE.match(str(it.get(key) or "").strip())
                if mm and ID_RE.match(mm.group(1)):
                    found.setdefault(mm.group(1), str(it.get(key)).strip())
                    break
    return found


def hidden_ids():
    try:
        with open(HIDDEN_FILE, encoding="utf-8") as f:
            text = f.read()
    except Exception:
        return set()
    start = text.find("export const HIDDEN_IDS = {")
    end = text.find("};", start)
    return set(re.findall(r'"([A-Za-z0-9]+)":', text[start:end])) if start >= 0 else set()


def is_dead(url):
    """True only when the Videy CDN answers 404/410 on 3 cache-busted tries. Errors count as alive."""
    for t in range(3):
        if t:
            time.sleep(5)
        req = urllib.request.Request(
            f"{url}?cb={int(time.time())}{t}",
            headers={"Range": "bytes=0-1", "User-Agent": "Mozilla/5.0"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30):
                return False
        except urllib.error.HTTPError as e:
            if e.code not in (404, 410):
                return False
        except Exception:
            return False
    return True


def hide(ids):
    """Add dead Videy ids to HIDDEN_IDS (never deletes anything)."""
    if not ids:
        return
    with open(HIDDEN_FILE, encoding="utf-8") as f:
        text = f.read()
    head = "export const HIDDEN_IDS = {\n"
    i = text.find(head)
    if i < 0:
        print("HIDDEN_IDS not found, nothing hidden")
        return
    add = "".join(f'  "{v}": "{DEAD_REASON}",\n' for v in sorted(ids))
    i += len(head)
    with open(HIDDEN_FILE, "w", encoding="utf-8") as f:
        f.write(text[:i] + add + text[i:])


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
    hid = hidden_ids()
    files = {k: v for k, v in videy_files().items() if k not in hid}
    made = failed = 0
    dead = set()
    for vid, url in files.items():
        dest = os.path.join(OUT, f"{vid}.jpg")
        if os.path.exists(dest):
            continue
        if grab(url, dest):
            made += 1
        else:
            failed += 1
            if is_dead(url):
                dead.add(vid)
                print(f"dead (hidden): {vid}")
            else:
                print(f"no frame: {vid}")
    hide(dead)
    print(f"videy: {len(files)} total, {made} new thumbs, {failed} failed, {len(dead)} hidden as dead")


if __name__ == "__main__":
    main()
