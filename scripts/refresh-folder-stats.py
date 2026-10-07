#!/usr/bin/env python3
"""Refresh views/duration/likes in src/lib/catalog/video-stats.json from the owner's 3 folders.

Fills/updates stats for any video id that exists in the catalog (bundled JSON files and the
bot feeds under data/, including future uploads), matched by id or embed id. Never adds or
removes videos and never touches any catalog file: only video-stats.json is written.
Our own like counts live in Cloudflare KV (likes:v1:*) and are never touched here.
Polite pacing + retries for 522/5xx.
"""
import glob, json, re, subprocess, sys, time

FOLDERS = [
    "https://tv1.indoav.app/f/9DaQXgw7uFQs",
    "https://tv1.userbokep.com/f/Z5B2P6lTlqi7",
    "https://tv1.userbokep.com/f/oGTW9gH3jfHf",
]
PATH = "src/lib/catalog/video-stats.json"
ART = re.compile(r'<article class="video-card.*?</article>', re.S)


def get(url):
    for a in range(8):
        r = subprocess.run(["curl", "-s", "--max-time", "60", "-A", "Mozilla/5.0", "-w", "\n%{http_code}", url],
                           capture_output=True, text=True, errors="replace")
        body, _, code = r.stdout.rpartition("\n")
        if code == "200":
            return body
        if code == "404":
            return ""
        print("retry", url, code, flush=True)
        time.sleep(min(180, 15 * (a + 1)))
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


def main():
    stats = json.load(open(PATH))
    lower = catalog_keys()
    for k in stats:
        lower.setdefault(k.lower(), k)
    print("catalog keys", len(lower), flush=True)
    updated = 0
    failed = False
    for base in FOLDERS:
        p, empty = 1, 0
        while p < 2000:
            html = get(base if p == 1 else f"{base}/page/{p}")
            if html is None:
                print("give up", base, p, flush=True)
                failed = True
                break
            blocks = ART.findall(html)
            if not blocks:
                empty += 1
                if empty >= 2:
                    break
            else:
                empty = 0
            for b in blocks:
                m = re.search(r'href="https://[^/]+/d/(\w+)"', b)
                if not m:
                    continue
                key = lower.get(m.group(1).lower())
                if not key:
                    continue  # not in catalog: stats only, never add videos
                old = stats.get(key, [0, 0, 0])
                new = [num(stat(b, "eye")), dur(stat(b, "clock")) or old[1], num(stat(b, "heart"))]
                if new != stats.get(key):
                    stats[key] = new
                    updated += 1
            p += 1
            time.sleep(2)
    with open(PATH, "w") as f:
        json.dump(dict(sorted(stats.items())), f, separators=(",", ":"))
    print("updated", updated, "failed", failed)


if __name__ == "__main__":
    sys.exit(main())
