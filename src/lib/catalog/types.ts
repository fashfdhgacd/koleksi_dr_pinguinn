export const DEFAULT_PAGE_SIZE = 24;
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
