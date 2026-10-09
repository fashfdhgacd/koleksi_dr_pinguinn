#!/usr/bin/env python3
"""Extra stats for the 12-hour "Refresh folder stats" workflow (runs after refresh-folder-stats.py).

1) Our own likes: GET https://koleksidrpinguin.com/api/site-likes (D1 video_likes aggregate, see
   server/middleware/stats-feed.ts) -> src/lib/catalog/site-likes.json ({id: n}, n > 0).
   Cards show source likes + these; the watch page keeps reading D1 live.
2) Putarin duration/views: dev API list GET {PUTARIN_API_BASE}/videos?page=N (X-API-Key) when
   PUTARIN_API_KEY is set. Any numeric duration/views field found is written into video-stats.json
   ([views, duration_sec, likes], likes kept) for Putarin ids only. Missing fields change nothing.
   Streamtape's API (file/info) has no duration or views, so Streamtape cards show likes only.

Writes ONLY src/lib/catalog/site-likes.json and src/lib/catalog/video-stats.json.
Never adds/removes/hides videos; a failed request keeps the previous file as it is.
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATS = os.path.join(ROOT, "src", "lib", "catalog", "video-stats.json")
LIKES = os.path.join(ROOT, "src", "lib", "catalog", "site-likes.json")
SITE = (os.environ.get("SITE_ORIGIN") or "https://koleksidrpinguin.com").rstrip("/")
UA = "Mozilla/5.0 (compatible; kdp-stats/1.0; +https://koleksidrpinguin.com)"
PT_RE = re.compile(r"^https?://[^/]*(?:putarin|puterin)[^/]*/[evd]/([A-Za-z0-9_-]+)", re.I)
SOURCES = [
    "src/lib/catalog/videos.json",
    "src/lib/catalog/putarin.json",
    "src/lib/catalog/folder-batch-*.json",
    "src/lib/catalog/data-*.json",
    "data/videos-latest.json",
    "data/putarin.json",
    "data/putarin-latest.json",
]
DUR_KEYS = ("duration", "duration_sec", "duration_seconds", "durationSeconds", "length", "video_length", "runtime")
VIEW_KEYS = ("views", "view_count", "views_count", "viewCount", "total_views", "plays")


def log(msg: str) -> None:
    print(msg, flush=True)


def http_json(url: str, headers: dict | None = None, timeout: float = 30.0):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception:
        return 0, None


def write_atomic(path: str, data: dict) -> None:
    text = json.dumps(dict(sorted(data.items())), separators=(",", ":"))
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tmp-", suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def site_likes() -> None:
    for attempt in range(3):
        status, d = http_json(f"{SITE}/api/site-likes")
        if status == 200 and isinstance(d, dict) and d.get("ok") and isinstance(d.get("likes"), dict):
            likes = {}
            for k, v in d["likes"].items():
                try:
                    n = int(v)
                except (TypeError, ValueError):
                    continue
                if re.fullmatch(r"[A-Za-z0-9_-]{3,64}", str(k)) and n > 0:
                    likes[str(k)] = n
            write_atomic(LIKES, likes)
            log(f"site likes: {len(likes)} videos, {sum(likes.values())} likes")
            return
        log(f"site likes: HTTP {status} (try {attempt + 1})")
        time.sleep(5 * (attempt + 1))
    log("::warning::site likes: feed unavailable, site-likes.json kept as it is")


def seconds(v) -> int:
    if isinstance(v, (int, float)) and v > 0:
        return int(v)
    s = str(v or "").strip()
    if re.fullmatch(r"\d+(\.\d+)?", s):
        return int(float(s))
    m = re.fullmatch(r"(?:(\d+):)?(\d{1,2}):(\d{2})", s)
    if m:
        return int(m.group(1) or 0) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
    return 0


def count(v) -> int | None:
    if isinstance(v, (int, float)) and v >= 0:
        return int(v)
    s = str(v or "").strip()
    return int(s) if s.isdigit() else None


def putarin_ids() -> dict[str, str]:
    """putarin code (lowercase) -> catalog id."""
    out: dict[str, str] = {}
    for pattern in SOURCES:
        for path in sorted(glob.glob(os.path.join(ROOT, pattern))):
            try:
                data = json.load(open(path, encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if isinstance(data, dict):
                data = data.get("items") or data.get("videos") or []
            if not isinstance(data, list):
                continue
            for it in data:
                if not isinstance(it, dict) or not it.get("id"):
                    continue
                for f in ("embed", "direct"):
                    m = PT_RE.match(str(it.get(f) or ""))
                    if m:
                        out.setdefault(m.group(1).lower(), str(it["id"]))
    return out


def putarin_stats() -> None:
    key = os.environ.get("PUTARIN_API_KEY") or ""
    if not key:
        log("putarin: no PUTARIN_API_KEY, skipped")
        return
    base = (os.environ.get("PUTARIN_API_BASE") or "https://panel.putarin.com/api/dev").rstrip("/")
    ids = putarin_ids()
    log(f"putarin: {len(ids)} catalog videos")
    if not ids:
        return
    found: dict[str, tuple[int | None, int]] = {}
    shown_keys = False
    page, total = 1, None
    while page <= 200:
        status, d = http_json(f"{base}/videos?page={page}", {"X-API-Key": key})
        if status != 200 or not isinstance(d, dict):
            log(f"putarin: list page {page} HTTP {status}, stop")
            break
        videos = d.get("videos") or d.get("data") or []
        if not isinstance(videos, list) or not videos:
            break
        if not shown_keys and isinstance(videos[0], dict):
            log("putarin: list fields = " + ",".join(sorted(map(str, videos[0].keys()))))
            shown_keys = True
        for v in videos:
            if not isinstance(v, dict):
                continue
            cid = ids.get(str(v.get("code") or "").lower())
            if not cid:
                continue
            secs = next((seconds(v[k]) for k in DUR_KEYS if k in v and seconds(v[k]) > 0), 0)
            views = next((count(v[k]) for k in VIEW_KEYS if k in v and count(v[k]) is not None), None)
            if secs or views is not None:
                found[cid] = (views, secs)
        total = d.get("total") if isinstance(d.get("total"), int) else total
        if total is not None and page * max(1, len(videos)) >= total:
            break
        page += 1
        time.sleep(1)
    log(f"putarin: duration/views found for {len(found)} of {len(ids)}")
    if not found:
        return
    stats = json.load(open(STATS, encoding="utf-8"))
    changed = 0
    for cid, (views, secs) in found.items():
        old = stats.get(cid, [0, 0, 0])
        new = [views if views is not None else old[0], secs or old[1], old[2]]
        if new != old:
            stats[cid] = new
            changed += 1
    write_atomic(STATS, stats)
    log(f"putarin: {changed} stats entries updated")


def main() -> int:
    site_likes()
    try:
        putarin_stats()
    except Exception as e:  # never break the workflow on an API change
        log(f"::warning::putarin stats skipped: {type(e).__name__}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
