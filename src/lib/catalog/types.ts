// 35 videos + 1 ad card = 36 grid cells: full rows at 4 and 3 columns (video-grid.tsx).
export const DEFAULT_PAGE_SIZE = 35;
export const MAX_PAGE_SIZE = 48;

export type CatalogType =
  | "home"
  | "latest"
  | "featured"
  | "category"
  | "search"
  | "detail"
  | "related"
  | "categories";

export type VideoQuality = {
  label: string;
  url: string;
  format: string;
};

export type VideoCard = {
  id: string;
  title: string;
  thumbnail: string;
  description: string;
  category: string;
  duration: number | null;
  durationLabel: string;
  quality: string;
  year: string | null;
  creator: string | null;
  views: number | null;
  likes?: number | null;
  /** Our own likes (D1 video_likes, 12-hour snapshot in site-likes.json). Cards only; the watch page reads D1 live. */
  siteLikes?: number | null;
};

export type VideoDetail = VideoCard & {
  video_url: string | null;
  qualities: VideoQuality[];
  subjects: string[];
  playable: boolean;
};

export type CategoryInfo = {
  slug: string;
  label: string;
  /** Jumlah video (hanya diisi oleh daftar kategori /kategori). */
  count?: number;
};

export type PagedVideos = {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  items: VideoCard[];
};

export type CatalogSuccess =
  | ({ ok: true; type: "home"; featured: VideoCard[]; categories: CategoryInfo[] } & {
      latest: PagedVideos;
    })
  | ({ ok: true; type: "latest" | "featured" | "category" | "search" | "related" } & PagedVideos)
  | { ok: true; type: "detail"; item: VideoDetail; related: VideoCard[] }
  | { ok: true; type: "categories"; categories: CategoryInfo[] };

export type CatalogError = {
  ok: false;
  error: string;
  code: "bad_request" | "not_found" | "upstream" | "empty";
  stale?: boolean;
};

export type CatalogResponse = CatalogSuccess | CatalogError;
