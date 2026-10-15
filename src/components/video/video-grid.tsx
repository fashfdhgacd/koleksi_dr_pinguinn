// Grid: 2 / 3 / 4 kolom (mobile / tablet / desktop).
// Catalog grids (ads): fluid columns filling the content width (1 / 3 / 4), card thumbs 300:250
// like the ad card, four ExoClick ad cards, one per zone (see adCells): mobile after videos 6/15/24/33, wide cells 10/18/26/34. Pages hold 35 videos (DEFAULT_PAGE_SIZE),
// so videos + ad = 36 cells and every row is full at 4 and 3 columns. The watch page keeps the default grid.
import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { isRealMinor } from "@/lib/minor-terms";
import { Skeleton } from "@/components/ui/skeleton";
import { AdSlot, AD_ZONES } from "@/components/ad-slot";
import { VideoCard } from "./video-card";

const DEFAULT_GRID =
  "grid grid-cols-2 gap-x-2.5 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-4";
const AD_GRID =
  "grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-y-7 lg:grid-cols-4 [&>a>div:first-child]:aspect-[300/250]";
/**
 * Ad slots, one per zone (AD_ZONES order). Each slot is placed before video `index`.
 * - Mobile (1 column): after videos 6, 15, 24, 33.
 * - Tablet/desktop (3 / 4 columns): cells 10, 18, 26, 34.
 * Slots only render when the list reaches them; the other breakpoint's slots are display:none.
 * Short lists (< 11 videos): one ad after the 4th video, all breakpoints.
 */
type AdAt = { index: number; className: string; zoneId: string };
const MOBILE_AT = [6, 15, 24, 33];
const WIDE_AT = [9, 16, 23, 30]; // cells 10, 18, 26, 34 counting the earlier ads
function adCells(count: number): AdAt[] {
  if (count < 11) return [{ index: Math.min(4, count), className: "", zoneId: AD_ZONES[0] }];
  const cells: AdAt[] = [];
  MOBILE_AT.forEach((index, i) => {
    if (index < count) cells.push({ index, className: "sm:hidden", zoneId: AD_ZONES[i] });
  });
  WIDE_AT.forEach((index, i) => {
    if (index < count) cells.push({ index, className: "hidden sm:block", zoneId: AD_ZONES[i] });
  });
  return cells;
}

/**
 * Tablet/desktop: hide up to 3 trailing videos so cells fill whole rows at 3 and 4 columns
 * (multiple of 12, e.g. 35 videos + 4 ads = 39 -> 36). Ads are divs, videos are links, so
 * nth-last-of-type only counts videos. Static strings so Tailwind generates them.
 */
const TRIM_CLASS = [
  "",
  " sm:[&>a:nth-last-of-type(-n+1)]:hidden",
  " sm:[&>a:nth-last-of-type(-n+2)]:hidden",
  " sm:[&>a:nth-last-of-type(-n+3)]:hidden",
];
function trimClass(count: number, cells: AdAt[]): string {
  const wideAds = cells.filter((c) => c.className !== "sm:hidden").length;
  const total = count + wideAds;
  const extra = total % 12;
  return total > 12 && extra > 0 && extra <= 3 ? TRIM_CLASS[extra] : "";
}

function visibleCards(items: VideoCardType[]): VideoCardType[] {
  return items.filter((video) => !isRealMinor({ title: video.title, tags: video.category }));
}

export function VideoGrid({
  items,
  eagerCount = 4,
  ads = false,
}: {
  items: VideoCardType[];
  eagerCount?: number;
  ads?: boolean;
}) {
  const shown = visibleCards(items);
  const cells = ads ? adCells(shown.length) : [];
  return (
    <div className={ads ? AD_GRID + trimClass(shown.length, cells) : DEFAULT_GRID}>
      {shown.map((video, index) => (
        <VideoCardWithAd
          key={video.id}
          video={video}
          eager={index < eagerCount}
          adBefore={cells.filter((c) => c.index === index)}
        />
      ))}
      {shown.length > 0
        ? cells.filter((c) => c.index >= shown.length).map((c, i) => <AdSlot key={`ad-end-${i}`} className={c.className} zoneId={c.zoneId} />)
        : null}
    </div>
  );
}

function VideoCardWithAd({
  video,
  eager,
  adBefore,
}: {
  video: VideoCardType;
  eager: boolean;
  adBefore: AdAt[];
}) {
  if (!adBefore.length) return <VideoCard video={video} eager={eager} />;
  return (
    <>
      {adBefore.map((c, i) => (
        <AdSlot key={i} className={c.className} zoneId={c.zoneId} />
      ))}
      <VideoCard video={video} eager={eager} />
    </>
  );
}

export function VideoGridSkeleton({ count = 12, ads = false }: { count?: number; ads?: boolean }) {
  return (
    <div className={ads ? AD_GRID : DEFAULT_GRID}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-1 sm:p-1.5">
          <Skeleton className={ads ? "aspect-[300/250] rounded-xl" : "aspect-video rounded-xl"} />
          <Skeleton className="mt-3 h-4 w-4/5 rounded-sm" />
          <Skeleton className="mt-2 h-3 w-1/3 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
