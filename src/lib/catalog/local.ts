import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { findCategory } from "./categories";
import localCatalog from "./videos.json";
import streamtapeBatch from "./streamtape.json";
import localPosters from "./posters.json";

const CACHE_MS = 60 * 1000;

/** Bot uploads di GitHub — selalu di-fetch server-side (bukan hanya kalau CATALOG_REMOTE). */
const BOT_FEEDS = [
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/putarin-latest.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/putarin.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguin/main/data/putarin.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/videos-latest.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/campur-latest.json",
];
