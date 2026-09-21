#!/usr/bin/env python3
"""Drop Videy rows from videos.json copies. Does not touch posters/putarin."""
from __future__ import annotations

import json
import re
from pathlib import Path

PATHS = [
    Path("src/lib/catalog/videos.json"),
    Path("data/videos.json"),
]


def is_videy(item: object) -> bool:
    if not isinstance(item, dict):
        return False
    blob = " ".join(str(item.get(k, "")) for k in ("embed", "direct", "source", "category", "title", "id"))
    return bool(re.search(r"videy", blob, re.I))


def strip(path: Path) -> tuple[int, int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise SystemExit(f"{path} is not a list")
    kept = [x for x in data if not is_videy(x)]
    dropped = len(data) - len(kept)
    path.write_text(json.dumps(kept, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return len(kept), dropped


def main() -> None:
    for path in PATHS:
        if not path.exists():
            print("skip missing", path)
            continue
        kept, dropped = strip(path)
        print(f"{path} kept={kept} dropped={dropped} bytes={path.stat().st_size}")


if __name__ == "__main__":
    main()
