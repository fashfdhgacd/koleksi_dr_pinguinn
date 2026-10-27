#!/usr/bin/env python3
"""Dead-video check for Streamtape and Putarin (runs in the 12-hour "Refresh folder stats" workflow).

Writes ONLY src/lib/catalog/dead-sources.json:
  {"checkedAt": ISO-UTC, "gone": {id: {host, code, since, status}}, "suspect": {id: {host, code, first, status}}}

- Streamtape: public https://api.streamtape.com/file/info, 100 file ids per call
  (status 404/410/451 = removed). STREAMTAPE_LOGIN/STREAMTAPE_KEY are passed along when set.
- Putarin: dev API GET {PUTARIN_API_BASE}/video/{code} with header X-API-Key: PUTARIN_API_KEY
  (404/410 = removed). Without the key, the public embed page is used: it answers
  '<div class="err">Video tidak tersedia</div>' for a removed video.
- A video is only marked "gone" after two runs at least 6 hours apart both say it is removed
  (first run -> "suspect"). A later run that sees it alive again clears it.
- Network errors / unexpected answers never change the previous state for that video.
- Sanity cap: if more than 25% of the checked videos of one host would newly turn bad (and at least
  20 were checked), the host's update is skipped (source outage, API change, blocked runner).
- Never touches catalog files and never hides or deletes anything: /pemilik only lists them and the
  watch page shows "Dihapus oleh sumber".
"""
from __future__ import annotations

import concurrent.futures as cf
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
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "lib", "catalog", "dead-sources.json")
SOURCES = [
    "src/lib/catalog/videos.json",
    "src/lib/catalog/streamtape.json",
    "src/lib/catalog/streamtape-batch-*.json",
    "src/lib/catalog/putarin.json",
    "src/lib/catalog/folder-batch-*.json",
    "src/lib/catalog/data-*.json",
    "data/videos.json",
    "data/videos-latest.json",
    "data/videos-latest-p[0-9]*.json",  # later chunks (src/lib/catalog/chunk-contract.js)
    "data/putarin.json",
    "data/putarin-latest.json",
    "data/putarin-latest-p[0-9]*.json",  # later chunks (src/lib/catalog/chunk-contract.js)
]
UA = "Mozilla/5.0 (compatible; kdp-dead-check/1.0; +https://koleksidrpinguin.com)"
CONFIRM_GAP_S = 6 * 3600
MAX_NEW_BAD_SHARE = 0.25
MIN_FOR_CAP = 20

ST_RE = re.compile(r"^https?://(?:www\.)?(?:streamtape\.[a-z]+|strcloud\.[a-z]+|streamta\.pe)/[evd]/([A-Za-z0-9]+)", re.I)
PT_RE = re.compile(r"^https?://([^/]*(?:putarin|puterin)[^/]*)/[evd]/([A-Za-z0-9_-]+)", re.I)
ID_RE = re.compile(r"^[A-Za-z0-9_-]{3,64}$")


def log(msg: str) -> None:
    print(msg, flush=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s: str | None) -> float:
    if not s:
        return 0.0
    try:
        return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
    except ValueError:
        return 0.0


def load_items() -> dict[str, dict]:
    """id -> {host, code, embed} for Streamtape and Putarin videos in the catalog files."""
    out: dict[str, dict] = {}
    for pattern in SOURCES:
        for path in sorted(glob.glob(os.path.join(ROOT, pattern))):
            try:
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
            except (OSError, ValueError) as e:
                log(f"skip {path}: {e}")
                continue
            items = data if isinstance(data, list) else (data.get("items") or data.get("videos") or [])
            if not isinstance(items, list):
                continue
            for it in items:
                if not isinstance(it, dict):
                    continue
                vid = str(it.get("id") or "").strip()
                if not ID_RE.match(vid) or vid in out:
                    continue
                for key in ("embed", "direct", "url", "video_url"):
                    url = str(it.get(key) or "").strip()
                    m = ST_RE.match(url)
                    if m:
                        out[vid] = {"host": "Streamtape", "code": m.group(1), "embed": url}
                        break
                    m = PT_RE.match(url)
                    if m:
                        out[vid] = {"host": "Putarin", "code": m.group(2), "embed": url}
                        break
    return out


def http_get(url: str, headers: dict | None = None, timeout: float = 20.0) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, res.read(400_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            body = e.read(20_000).decode("utf-8", "replace")
        except Exception:
            body = ""
        return e.code, body


def check_streamtape(codes: list[str]) -> dict[str, tuple[str, int]]:
    """code -> ("alive"|"gone", status). Codes with unknown results are left out."""
    res: dict[str, tuple[str, int]] = {}
    api = (os.environ.get("STREAMTAPE_API") or "https://api.streamtape.com").rstrip("/")
    login = os.environ.get("STREAMTAPE_LOGIN") or ""
    key = os.environ.get("STREAMTAPE_KEY") or ""
    for i in range(0, len(codes), 100):
        chunk = codes[i : i + 100]
        q = {"file": ",".join(chunk)}
        if login and key:
            q.update({"login": login, "key": key})
        url = f"{api}/file/info?{urllib.parse.urlencode(q)}"
        data = None
        for attempt in range(3):
            try:
                status, body = http_get(url, {"Accept": "application/json"})
                if status == 200:
                    data = json.loads(body)
                    if data.get("status") == 200 and isinstance(data.get("result"), dict):
                        break
                log(f"streamtape: HTTP {status} (try {attempt + 1})")
            except Exception as e:  # network / JSON
                log(f"streamtape: {type(e).__name__} (try {attempt + 1})")
            data = None
            time.sleep(3 * (attempt + 1))
        if not data:
            continue
        for code in chunk:
            info = data["result"].get(code)
            if not isinstance(info, dict):
                continue
            st = int(info.get("status") or 0)
            if st == 200:
                res[code] = ("alive", 200)
            elif st in (404, 410, 451):
                res[code] = ("gone", st)
        time.sleep(1)
    return res


def check_putarin_one(code: str, embed: str, key: str, base: str) -> tuple[str, int] | None:
    try:
        if key:
            status, body = http_get(
                f"{base}/video/{urllib.parse.quote(code)}",
                {"X-API-Key": key, "Accept": "application/json"},
                timeout=15,
            )
            if status == 200:
                return ("alive", 200)
            if status in (404, 410):
                return ("gone", status)
            # 401/403/5xx: fall through to the public page
        page = embed if PT_RE.match(embed) else f"https://puterin.biz/e/{code}"
        page = re.sub(r"/[vd]/", "/e/", page, count=1)
        status, body = http_get(page, {"Accept": "text/html"}, timeout=15)
        if status in (404, 410):
            return ("gone", status)
        if status != 200:
            return None
        if 'class="err">Video tidak tersedia<' in body and "jwplayer(" not in body:
            return ("gone", 404)
        if "jwplayer" in body or "<video" in body or "sources" in body:
            return ("alive", 200)
        return None
    except Exception:
        return None


def check_putarin(items: list[tuple[str, str]]) -> dict[str, tuple[str, int]]:
    key = os.environ.get("PUTARIN_API_KEY") or ""
    base = (os.environ.get("PUTARIN_API_BASE") or "https://panel.putarin.com/api/dev").rstrip("/")
    log(f"putarin: {'dev API with key' if key else 'public embed page (no PUTARIN_API_KEY)'}")
    res: dict[str, tuple[str, int]] = {}
    with cf.ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(check_putarin_one, code, embed, key, base): code for code, embed in items}
        for fut in cf.as_completed(futs):
            r = fut.result()
            if r:
                res[futs[fut]] = r
    return res


def load_state() -> dict:
    try:
        with open(OUT, encoding="utf-8") as f:
            d = json.load(f)
        if isinstance(d, dict):
            return {
                "checkedAt": d.get("checkedAt"),
                "gone": d.get("gone") if isinstance(d.get("gone"), dict) else {},
                "suspect": d.get("suspect") if isinstance(d.get("suspect"), dict) else {},
            }
    except (OSError, ValueError):
        pass
    return {"checkedAt": None, "gone": {}, "suspect": {}}


def write_atomic(path: str, data: dict) -> None:
    text = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".dead-", suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def main() -> int:
    items = load_items()
    state = load_state()
    ts = now_iso()
    now = parse_iso(ts)
    gone: dict = {k: v for k, v in state["gone"].items() if k in items}
    suspect: dict = {k: v for k, v in state["suspect"].items() if k in items}

    by_host: dict[str, list[str]] = {"Streamtape": [], "Putarin": []}
    for vid, it in items.items():
        by_host[it["host"]].append(vid)
    log(f"catalog: {len(by_host['Streamtape'])} Streamtape, {len(by_host['Putarin'])} Putarin")

    st_codes = sorted({items[v]["code"] for v in by_host["Streamtape"]})
    st_res = check_streamtape(st_codes) if st_codes else {}
    pt_pairs = sorted({(items[v]["code"], items[v]["embed"]) for v in by_host["Putarin"]})
    pt_res = check_putarin(pt_pairs) if pt_pairs else {}

    for host, results in (("Streamtape", st_res), ("Putarin", pt_res)):
        ids = by_host[host]
        checked = [v for v in ids if items[v]["code"] in results]
        newly_bad = [v for v in checked if results[items[v]["code"]][0] == "gone" and v not in gone and v not in suspect]
        log(f"{host}: checked {len(checked)}/{len(ids)}, newly bad {len(newly_bad)}")
        if len(checked) >= MIN_FOR_CAP and len(newly_bad) > MAX_NEW_BAD_SHARE * len(checked):
            log(f"{host}: too many newly bad ({len(newly_bad)}/{len(checked)}), skipping this host's update")
            continue
        for vid in checked:
            verdict, status = results[items[vid]["code"]]
            code = items[vid]["code"]
            if verdict == "alive":
                gone.pop(vid, None)
                suspect.pop(vid, None)
                continue
            if vid in gone:
                continue
            prev = suspect.get(vid)
            if prev and now - parse_iso(prev.get("first")) >= CONFIRM_GAP_S:
                suspect.pop(vid, None)
                gone[vid] = {"host": host, "code": code, "since": ts, "status": status}
            elif not prev:
                suspect[vid] = {"host": host, "code": code, "first": ts, "status": status}

    out = {"checkedAt": ts, "gone": gone, "suspect": suspect}
    write_atomic(OUT, out)
    log(f"done: {len(gone)} gone, {len(suspect)} suspect -> {os.path.relpath(OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
