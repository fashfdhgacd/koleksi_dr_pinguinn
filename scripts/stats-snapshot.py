#!/usr/bin/env python3
"""Daily stats snapshots + week/month deltas for /kategori/paling-ditonton and /paling-disukai.

Run by .github/workflows/refresh-folder-stats.yml right after the folder crawl (every 12 h).
 - stats-history/YYYY-MM-DD.json (WIB date): {id: [views, likes]} copied from video-stats.json,
   only ids with views or likes > 0. One file per day (a later run the same day overwrites it),
   files older than KEEP_DAYS are deleted, so the history stays bounded (~35 files of ~150 KB).
 - src/lib/catalog/rank-periods.json: per period the top TOP ids by positive delta between today's
   snapshot and the newest snapshot that is at least 7 / 30 days old. Ids without a baseline in
   that older snapshot are skipped (no guessed numbers). null until such a snapshot exists.
 - src/lib/catalog/rank-periods-meta.json: tiny availability info the site uses to enable tabs.
Never touches the catalog or video-stats.json.
"""
import datetime as dt
import glob
import json
import os

STATS = "src/lib/catalog/video-stats.json"
HIST = "stats-history"
OUT = "src/lib/catalog/rank-periods.json"
META = "src/lib/catalog/rank-periods-meta.json"
KEEP_DAYS = 35
TOP = 1000


def wib_today():
    return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=7)).date()


def dump(path, data):
    with open(path, "w") as f:
        json.dump(data, f, separators=(",", ":"), sort_keys=True)
        f.write("\n")


def main():
    stats = json.load(open(STATS))
    today = wib_today()
    snap = {}
    for k, v in stats.items():
        if not isinstance(v, list) or len(v) < 3:
            continue
        views, likes = int(v[0] or 0), int(v[2] or 0)
        if views > 0 or likes > 0:
            snap[k] = [views, likes]
    os.makedirs(HIST, exist_ok=True)
    dump(f"{HIST}/{today.isoformat()}.json", snap)

    days = {}
    for p in glob.glob(f"{HIST}/*.json"):
        try:
            d = dt.date.fromisoformat(os.path.basename(p)[:-5])
        except ValueError:
            continue
        if (today - d).days > KEEP_DAYS:
            os.remove(p)
            continue
        days[d] = p

    def top(m):
        return dict(sorted(m.items(), key=lambda x: (-x[1], x[0]))[:TOP])

    def period(n):
        base = [d for d in days if (today - d).days >= n]
        if not base:
            return None
        b = max(base)
        old = json.load(open(days[b]))
        views, likes = {}, {}
        for k, (v, l) in snap.items():
            prev = old.get(k)
            if not prev:
                continue
            if v - prev[0] > 0:
                views[k] = v - prev[0]
            if l - prev[1] > 0:
                likes[k] = l - prev[1]
        return {"from": b.isoformat(), "to": today.isoformat(), "days": (today - b).days,
                "views": top(views), "likes": top(likes)}

    week, month = period(7), period(30)
    dump(OUT, {"v": 1, "week": week, "month": month})

    def info(p):
        return {"from": p["from"], "to": p["to"], "days": p["days"]} if p else None

    dump(META, {"v": 1, "updated": today.isoformat(), "firstSnapshot": min(days).isoformat(),
                "historyDays": len(days), "week": info(week), "month": info(month)})
    print("snapshot", today, "ids", len(snap), "history", len(days),
          "week", bool(week), "month", bool(month))


if __name__ == "__main__":
    main()
