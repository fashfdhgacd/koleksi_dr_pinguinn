# Growth, discovery, and search-engine verification

No spam, bots, paid links, or DNS changes are involved.

## Implemented in the repo
- IndexNow (Bing, Yandex, others) via `.github/workflows/indexnow.yml` every 6 hours; key file at `/73356680884e9de90f845b0907eb4053.txt`.
- `robots.txt` groups for Googlebot, Bingbot, Slurp (Yahoo), DuckDuckBot, Bravebot, Yandex; sitemap index with `lastmod` taken from real upload dates. Static pages carry no `lastmod` on purpose (no fake freshness).
- Canonical on every indexable page; search queries, deep pages, and `/cari/<slug>` landings with fewer than 12 clean videos are `noindex`.
- Structured data: WebSite + Organization (home), CollectionPage + BreadcrumbList (`/kategori` and categories), VideoObject (watch).
- Restricted videos (keyword-locked or awaiting verification) are never published, sitemapped, or sent to IndexNow.

## Owner actions that need the owner's accounts
1. Google Search Console: verify the domain, submit `/sitemap.xml`, review Page and Video indexing weekly.
2. Bing Webmaster Tools: submit the sitemap, confirm IndexNow status (Yahoo and DuckDuckGo draw on Bing).
3. Yandex Webmaster: verify and submit the sitemap.
4. Brave Search has no console; keep `Bravebot` allowed and earn real inbound links.
5. Cloudflare: confirm Bot Fight Mode does not challenge Googlebot/Bingbot and cache rules respect the app's `Cache-Control` (`s-maxage` + `stale-while-revalidate`).

## Brand awareness
Use "Koleksi Dr. Pinguin" consistently in titles, Organization schema, OG tags, and `/tentang`. Track branded-query impressions in Search Console as the main KPI. Every watch and category page ships OG/Twitter metadata with a thumbnail for link previews.

## Referral traffic and backlinks (organic only)
- `/teman` is the partner page: link only with relevant sites that link back naturally.
- Submit to legitimate directories and communities that allow it; log URL, date, status.
- Watch referrers in analytics (human vs bot already separated) and invest in sources with repeat visitors.

## Social discovery
Post only on platforms whose policies allow this content (e.g. X with sensitive-media labels, Telegram channels, adult-permitting communities). Skip Facebook, Instagram, TikTok, YouTube, Pinterest. Share a few curated, clean-titled videos with the canonical link; never automate mass posting or share content under review.

## Moderation separation (`/pemilik`)
School keyword/context, fictional character age, claimed performer age, and verification status are independent facts. Only a stated age under 18, "di bawah umur", SD/SMP/"anak SMA", loli/shota-type terms, or the minor detector blocks release. "False positive" needs a written basis, is logged in history, and never publishes by itself; the owner still presses Tayangkan.
