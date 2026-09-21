import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { findCategory } from "./categories";
import localCatalog from "./videos.json";
import streamtapeBatch from "./streamtape.json";
import putarinBatch from "./putarin.json";
import postersMap from "./posters.json";
import latestVideos from "../../../data/videos-latest.json";
import latestPosters from "../../../data/latest-posters.json";

const CACHE_MS = 10 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;

function feedUrl(path: string): string {
  const t = Math.floor(Date.now() / 600_000);
  return `${path}${path.includes("?") ? "&" : "?"}t=${t}`;
}

const BOT_FEEDS = [
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/videos-latest.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/latest-posters.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/putarin-latest.json",
];
