#!/usr/bin/env python3
"""Refresh views/duration/likes in src/lib/catalog/video-stats.json from the owner's 3 folders.

Fills/updates stats for any video id that exists in the catalog (bundled JSON files and the
bot feeds under data/, including future uploads), matched by id or embed id. Never adds or
removes videos and never touches any catalog file: only video-stats.json is written.
Our own like counts live in Cloudflare KV (likes:v1:*) and are never touched here.
Polite pacing + retries for 522/5xx.

IndoAV/UserBokep answer 403 to GitHub Actions runners (every run until 2026-10-09 ended with
"give up ... updated 0", so nothing uploaded after the manual fill of 2026-10-07 got stats).
When a folder answers 403 directly, the page is read through the site's own read-only feed
(GET https://koleksidrpinguin.com/api/folder-stats?f=<folder>&p=<page>, server/middleware/stats-feed.ts),
which fetches the same public folder page from the Cloudflare Worker and returns only the numbers.
"""
import glob, json, os, re, subprocess, sys, time

FOLDERS = [
    "https://tv1.indoav.app/f/9DaQXgw7uFQs",
    "https://tv1.userbokep.com/f/Z5B2P6lTlqi7",
    "https://tv1.userbokep.com/f/oGTW9gH3jfHf",
]
PATH = "src/lib/catalog/video-stats.json"
FEED = os.environ.get("FOLDER_FEED") or "https://koleksidrpinguin.com/api/folder-stats"
ART = re.compile(r'<article class="video-card.*?</article>', re.S)


def fetch(url, tries=8):
    """(status, body). status 403 is returned at once (blocked runner: use the feed instead)."""
    code = "0"
    for a in range(tries):
        r = subprocess.run(["curl", "-s", "--max-time", "60", "-A", "Mozilla/5.0", "-w", "\n%{http_code}", url],
                           capture_output=True, text=True, errors="replace")
        body, _, code = r.stdout.rpartition("\n")
        if code in ("200", "404", "403"):
            return code, body
        print("retry", url, code, flush=True)
        time.sleep(min(180, 15 * (a + 1)))
    return code, None


def get(url):
    code, body = fetch(url)
    if code == "200":
        return body
    if code == "404":
        return ""
    return None


def num(v):
    v = str(v or "").lower().replace(",", ".").strip()
    m = re.match(r"([\d.]+)\s*(k|rb|m|jt)?", v)
    if not m:
        return 0
    try:
        n = float(m.group(1)) if m.group(2) else float(m.group(1).replace(".", ""))
    except ValueError:
        return 0
    return int(n * {"k": 1e3, "rb": 1e3, "m": 1e6, "jt": 1e6}.get(m.group(2), 1))


def dur(s):
    t = 0
    for n, u in re.findall(r"(\d+)\s*([hms])", s or ""):
        t += int(n) * {"h": 3600, "m": 60, "s": 1}[u]
    return t


def stat(block, icon):
    m = re.search(r'data-icon="' + icon + r'">.*?<span class="text-xs">([^<]+)</span>', block, re.S)
    return m.group(1).strip() if m else ""


CATALOG_GLOBS = [
    "src/lib/catalog/videos.json",
    "src/lib/catalog/putarin.json",
    "src/lib/catalog/streamtape*.json",
    "src/lib/catalog/folder-batch-*.json",
    "src/lib/catalog/data-*.json",
    "data/videos-latest*.json",
    "data/putarin*.json",
    "data/campur*.json",
]


def catalog_keys():
    """lowercase id / embed id -> catalog id (read-only)."""
    out = {}
    for pattern in CATALOG_GLOBS:
        for path in sorted(glob.glob(pattern)):
            if path.endswith("-index.json"):
                continue
            try:
                data = json.load(open(path))
            except Exception:
                continue
            if isinstance(data, dict):
                data = data.get("items", [])
            if not isinstance(data, list):
                continue
            for it in data:
                if not isinstance(it, dict):
                    continue
                cid = str(it.get("id") or "").strip()
                if not cid:
                    continue
                out.setdefault(cid.lower(), cid)
                for f in ("embed", "direct"):
                    m = re.search(r"/(?:e|v|d|f|watch)/([A-Za-z0-9_-]+)", str(it.get(f) or ""))
                    if m:
                        out.setdefault(m.group(1).lower(), cid)
    return out


def parse_blocks(html):
    """[(code, views, duration_sec, likes)] from one folder page."""
    out = []
    for b in ART.findall(html):
        m = re.search(r'href="https://[^/]+/d/(\w+)"', b)
        if m:
            out.append((m.group(1), num(stat(b, "eye")), dur(stat(b, "clock")), num(stat(b, "heart"))))
    return out


def feed_page(folder_id, p):
    """Same page through the site's Worker feed. None = failed."""
    for a in range(5):
        code, body = fetch(f"{FEED}?f={folder_id}&p={p}", tries=1)
        if code == "200" and body:
            try:
                d = json.loads(body)
            except ValueError:
                d = None
            if isinstance(d, dict) and d.get("ok") and isinstance(d.get("items"), list):
                return [tuple(x) for x in d["items"] if isinstance(x, list) and len(x) == 4]
        print("feed retry", folder_id, p, code, (body or "")[:120].replace("\n", " "), flush=True)
        time.sleep(10 * (a + 1))
    return None


def folder_page(base, p, mode):
    """(rows | None, mode). mode: "direct" until the host answers 403, then "feed"."""
    if mode == "direct":
        url = base if p == 1 else f"{base}/page/{p}"
        code, html = fetch(url)
        if code == "200":
            return parse_blocks(html), mode
        if code == "404":
            return [], mode
        if code != "403":
            return None, mode
        print("403 from", url, "-> using site feed", flush=True)
        mode = "feed"
    return feed_page(base.rstrip("/").rsplit("/", 1)[-1], p), mode


def main():
    stats = json.load(open(PATH))
    lower = catalog_keys()
    for k in stats:
        lower.setdefault(k.lower(), k)
    print("catalog keys", len(lower), flush=True)
    updated = 0
    failed = False
    seen = 0
    ok_folders = 0
    for base in FOLDERS:
        p, empty, mode, folder_ok = 1, 0, "direct", True
        while p < 2000:
            rows, mode = folder_page(base, p, mode)
            if rows is None:
                print("give up", base, p, mode, flush=True)
                failed = True
                folder_ok = False
                break
            if not rows:
                empty += 1
                if empty >= 2:
                    break
            else:
                empty = 0
            for code, views, secs, likes in rows:
                seen += 1
                key = lower.get(str(code).lower())
                if not key:
                    continue  # not in catalog: stats only, never add videos
                old = stats.get(key, [0, 0, 0])
                new = [int(views), int(secs) or old[1], int(likes)]
                if new != stats.get(key):
                    stats[key] = new
                    updated += 1
            p += 1
            time.sleep(2)
        if folder_ok and p > 1:
            ok_folders += 1
    with open(PATH, "w") as f:
        json.dump(dict(sorted(stats.items())), f, separators=(",", ":"))
    print("updated", updated, "cards seen", seen, "folders ok", ok_folders, "of", len(FOLDERS), "failed", failed)
    if ok_folders == 0:
        print("::warning::folder stats: no folder could be read (direct 403 and site feed failed)", flush=True)


if __name__ == "__main__":
    sys.exit(main())
