/**
 * Lean anti-blokir front door for koleksidrpinguin.com.
 * Lists the latest videos from the public RSS feed (edge Cache API only — no KV, no secrets).
 * Share cards live at /v/:id with noindex + canonical back to the main watch page.
 */
const CANONICAL = "https://koleksidrpinguin.com";
const RSS = `${CANONICAL}/rss.xml`;
const CACHE_TTL = 900; // 15 minutes

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(s) {
  return esc(s).replace(/`/g, "&#96;");
}

function parseRss(xml) {
  const items = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const block of blocks) {
    const title = textOf(block, "title");
    const link = textOf(block, "link");
    const date = textOf(block, "pubDate");
    const enclosure = (block.match(/<enclosure[^>]*url="([^"]+)"/i) || [])[1] || "";
    const idMatch = link.match(/\/watch\/([^/?#]+)/);
    if (!idMatch) continue;
    const id = decodeURIComponent(idMatch[1]);
    items.push({ id, title: decodeEntities(title), link, date, thumb: decodeEntities(enclosure) });
  }
  return items;
}

function textOf(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}

function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function latestItems(request) {
  const cache = caches.default;
  const key = new Request(RSS, { method: "GET" });
  let res = await cache.match(key);
  if (!res) {
    const upstream = await fetch(RSS, {
      headers: { "user-agent": "kdp-anti-blokir", accept: "application/rss+xml, application/xml, text/xml" },
      cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
    });
    if (!upstream.ok) throw new Error("rss " + upstream.status);
    const xml = await upstream.text();
    res = new Response(xml, {
      headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": `public, max-age=${CACHE_TTL}` },
    });
    await cache.put(key, res.clone());
  }
  return parseRss(await res.text());
}

function layout({ title, canonical, description, image, robots, body, origin }) {
  const robotsVal = robots || "noindex, follow";
  const ogImage = image
    ? `<meta property="og:image" content="${attr(image)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${attr(image)}" />`
    : `<meta name="twitter:card" content="summary" />`;
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}" />
<meta name="robots" content="${attr(robotsVal)}" />
<meta name="referrer" content="no-referrer-when-downgrade" />
<link rel="canonical" href="${attr(canonical)}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${attr(title)}" />
<meta property="og:description" content="${attr(description)}" />
<meta property="og:url" content="${attr(canonical)}" />
${ogImage}
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#111; color:#f4f4f5; font-family: system-ui, sans-serif; }
  header { position:sticky; top:0; z-index:2; background:#181818; border-bottom:1px solid #2a2a2a; padding:14px 16px; }
  header a { color:#fff; text-decoration:none; font-weight:700; }
  .tag { display:inline-block; margin-top:6px; font-size:12px; color:#86efac; }
  main { max-width:720px; margin:0 auto; padding:16px; }
  .grid { display:grid; gap:12px; }
  .card { display:flex; gap:12px; background:#1a1a1a; border-radius:12px; overflow:hidden; color:inherit; text-decoration:none; }
  .card img { width:160px; height:90px; object-fit:cover; background:#222; flex:none; }
  .card h2 { font-size:15px; line-height:1.35; margin:10px 12px 0 0; font-weight:600; }
  .note { color:#a1a1aa; font-size:13px; line-height:1.5; }
  .btn { display:inline-block; margin-top:16px; background:#2dd4bf; color:#09090b; font-weight:700; padding:12px 18px; border-radius:12px; text-decoration:none; }
  .hero img { width:100%; max-height:280px; object-fit:cover; border-radius:12px; background:#222; }
  footer { padding:24px 16px 40px; color:#71717a; font-size:12px; text-align:center; }
  footer a { color:#a1a1aa; }
</style>
</head>
<body>
<header>
  <a href="/">Koleksi Dr. Pinguin</a>
  <div class="tag">Anti Blokir / tanpa VPN · 18+</div>
</header>
<main>${body}</main>
<footer>
  Pintu masuk cadangan. Isi yang sama ada di
  <a href="${attr(CANONICAL)}">${esc(CANONICAL.replace("https://", ""))}</a>.
  Halaman ini tidak diindeks Google.
</footer>
</body>
</html>`;
}

function watchUrl(id) {
  return `${CANONICAL}/watch/${encodeURIComponent(id)}`;
}

function mediaUrl(origin, id) {
  return `${origin}/media/${encodeURIComponent(id)}.jpg`;
}

function homeHtml(items, origin) {
  const cards = items
    .map((it) => {
      const href = `/v/${encodeURIComponent(it.id)}`;
      const img = mediaUrl(origin, it.id);
      return `<a class="card" href="${attr(href)}"><img src="${attr(img)}" alt="" width="160" height="90" loading="lazy" /><h2>${esc(it.title)}</h2></a>`;
    })
    .join("");
  const body = `
    <p class="note">Daftar video terbaru. Buka kartu ini dulu kalau koleksidrpinguin.com terkunci di jaringanmu, lalu lanjut ke halaman tonton.</p>
    <div class="grid">${cards || "<p class=note>Belum ada daftar. Coba buka situs utama.</p>"}</div>`;
  return layout({
    title: "Koleksi Dr. Pinguin — Anti Blokir / tanpa VPN",
    canonical: CANONICAL + "/",
    description: "Pintu masuk anti blokir, tanpa VPN, ke katalog Koleksi Dr. Pinguin. Konten dewasa 18+.",
    image: `${origin}/media/home.jpg`,
    robots: "noindex, follow",
    body,
    origin,
  });
}

function videoHtml(item, origin) {
  const id = item.id;
  const watch = watchUrl(id);
  const img = mediaUrl(origin, id);
  const title = item.title || "Video Koleksi Dr. Pinguin";
  const body = `
    <article class="hero">
      <img src="${attr(img)}" alt="" />
      <h1>${esc(title)}</h1>
      <p class="note">Anti Blokir / tanpa VPN. Video diputar di situs utama.</p>
      <a class="btn" href="${attr(watch)}" rel="noopener">Tonton di koleksidrpinguin.com</a>
    </article>`;
  return layout({
    title: `${title} — Anti Blokir`,
    canonical: watch,
    description: `Tonton “${title}” di Koleksi Dr. Pinguin. Pintu anti blokir / tanpa VPN. 18+.`,
    image: img,
    robots: "noindex, follow",
    body,
    origin,
  });
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=900",
      "x-robots-tag": "noindex, follow",
      "referrer-policy": "no-referrer-when-downgrade",
    },
  });
}

async function proxyMedia(id) {
  const upstream = `${CANONICAL}/og/${encodeURIComponent(id)}.jpg`;
  const res = await fetch(upstream, { cf: { cacheTtl: 86400, cacheEverything: true }, headers: { "user-agent": "kdp-anti-blokir" } });
  if (!res.ok) {
    const fallback = await fetch(`${CANONICAL}/brand-poster.jpg`, { cf: { cacheTtl: 86400, cacheEverything: true } });
    return new Response(fallback.body, {
      status: fallback.ok ? 200 : 404,
      headers: { "content-type": fallback.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=3600", "x-robots-tag": "noindex" },
    });
  }
  return new Response(res.body, {
    status: 200,
    headers: { "content-type": res.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=86400", "x-robots-tag": "noindex" },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = url.origin;
    const path = url.pathname;

    if (path === "/robots.txt") {
      return new Response(`User-agent: *\nDisallow: /\n\nUser-agent: Twitterbot\nAllow: /\n\nUser-agent: TelegramBot\nAllow: /\n\nUser-agent: facebookexternalhit\nAllow: /\n`, {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" },
      });
    }

    if (path === "/favicon.ico" || path === "/favicon.svg") {
      return Response.redirect(`${CANONICAL}/favicon.svg`, 302);
    }

    const media = path.match(/^\/media\/(.+?)\.jpg$/);
    if (media) {
      const id = decodeURIComponent(media[1]);
      if (id === "home") return fetch(`${CANONICAL}/brand-poster.jpg`, { cf: { cacheTtl: 86400, cacheEverything: true } }).then((res) => new Response(res.body, { status: res.ok ? 200 : 404, headers: { "content-type": res.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=86400", "x-robots-tag": "noindex" } }));
      return proxyMedia(id);
    }

    try {
      if (path === "/" || path === "/index.html") {
        const items = await latestItems(request);
        return htmlResponse(homeHtml(items, origin));
      }

      const video = path.match(/^\/v\/([^/]+)\/?$/);
      if (video) {
        const id = decodeURIComponent(video[1]);
        if (!id) return htmlResponse(homeHtml([], origin), 404);
        const items = await latestItems(request).catch(() => []);
        const item = items.find((it) => it.id === id) || { id, title: "Video Koleksi Dr. Pinguin", thumb: "", link: watchUrl(id) };
        return htmlResponse(videoHtml(item, origin));
      }
    } catch (err) {
      const body = `<p class="note">Daftar lagi tidak bisa dimuat. Buka langsung situs utama.</p><a class="btn" href="${attr(CANONICAL)}">Ke koleksidrpinguin.com</a>`;
      return htmlResponse(
        layout({
          title: "Koleksi Dr. Pinguin — Anti Blokir / tanpa VPN",
          canonical: CANONICAL + "/",
          description: "Pintu masuk anti blokir ke Koleksi Dr. Pinguin.",
          image: "",
          robots: "noindex, follow",
          body,
          origin,
        }),
        503,
      );
    }

    return new Response(null, { status: 302, headers: { location: "/" } });
  },
};
