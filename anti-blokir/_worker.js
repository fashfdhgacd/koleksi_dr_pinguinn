export default {
  async fetch(request) {
    const CANONICAL = "https://koleksidrpinguin.com";
    const RSS = CANONICAL + "/rss.xml";
    const url = new URL(request.url);
    const origin = url.origin;
    const path = url.pathname;
    const esc = (s) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const page = (title, canonical, desc, image, body) => {
      const og = image
        ? '<meta property="og:image" content="' + esc(image) + '"/>' +
          '<meta name="twitter:card" content="summary_large_image"/>' +
          '<meta name="twitter:image" content="' + esc(image) + '"/>'
        : '<meta name="twitter:card" content="summary"/>';
      return (
        "<!DOCTYPE html><html lang=\"id\"><head><meta charset=\"utf-8\"/>" +
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>" +
        "<title>" + esc(title) + "</title>" +
        "<meta name=\"description\" content=\"" + esc(desc) + "\"/>" +
        "<meta name=\"robots\" content=\"noindex, follow\"/>" +
        "<link rel=\"canonical\" href=\"" + esc(canonical) + "\"/>" +
        "<meta property=\"og:title\" content=\"" + esc(title) + "\"/>" +
        "<meta property=\"og:description\" content=\"" + esc(desc) + "\"/>" +
        "<meta property=\"og:url\" content=\"" + esc(canonical) + "\"/>" +
        og +
        "<style>body{margin:0;background:#111;color:#f4f4f5;font-family:system-ui,sans-serif}header{position:sticky;top:0;background:#181818;border-bottom:1px solid #2a2a2a;padding:14px 16px}header a{color:#fff;text-decoration:none;font-weight:700}.tag{margin-top:6px;font-size:12px;color:#86efac}main{max-width:720px;margin:0 auto;padding:16px}.grid{display:grid;gap:12px}.card{display:flex;gap:12px;background:#1a1a1a;border-radius:12px;overflow:hidden;color:inherit;text-decoration:none}.card img{width:160px;height:90px;object-fit:cover;background:#222;flex:none}.card h2{font-size:15px;line-height:1.35;margin:10px 12px 0 0}.note{color:#a1a1aa;font-size:13px;line-height:1.5}.btn{display:inline-block;margin-top:16px;background:#2dd4bf;color:#09090b;font-weight:700;padding:12px 18px;border-radius:12px;text-decoration:none}.hero img{width:100%;max-height:280px;object-fit:cover;border-radius:12px;background:#222}footer{padding:24px 16px 40px;color:#71717a;font-size:12px;text-align:center}footer a{color:#a1a1aa}</style></head>" +
        "<body><header><a href=\"/\">Koleksi Dr. Pinguin</a><div class=\"tag\">Anti Blokir / tanpa VPN · 18+</div></header><main>" +
        body +
        "</main><footer>Pintu masuk cadangan. Isi yang sama ada di <a href=\"" +
        esc(CANONICAL) +
        "\">koleksidrpinguin.com</a>. Halaman ini tidak diindeks Google.</footer></body></html>"
      );
    };

    const htmlRes = (html, status) =>
      new Response(html, {
        status: status || 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=300, s-maxage=900",
          "x-robots-tag": "noindex, follow",
        },
      });

    const parseRss = (xml) => {
      const items = [];
      for (const block of xml.split(/<item>/i).slice(1)) {
        const textOf = (tag) => {
          const m = block.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "i"));
          return m
            ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim().replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
            : "";
        };
        const link = textOf("link");
        const idm = link.match(/\/watch\/([^/?#]+)/);
        if (!idm) continue;
        items.push({ id: decodeURIComponent(idm[1]), title: textOf("title"), link });
      }
      return items;
    };

    const latest = async () => {
      const cache = caches.default;
      const key = new Request(RSS, { method: "GET" });
      let res = await cache.match(key);
      if (!res) {
        const up = await fetch(RSS, { headers: { "user-agent": "kdp-anti-blokir" }, cf: { cacheTtl: 900, cacheEverything: true } });
        if (!up.ok) throw new Error("rss " + up.status);
        const xml = await up.text();
        res = new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=900" } });
        await cache.put(key, res.clone());
      }
      return parseRss(await res.text());
    };

    const proxyOg = async (id) => {
      const up = await fetch(CANONICAL + "/og/" + encodeURIComponent(id) + ".jpg", {
        cf: { cacheTtl: 86400, cacheEverything: true },
        headers: { "user-agent": "kdp-anti-blokir" },
      });
      if (!up.ok) {
        const fb = await fetch(CANONICAL + "/brand-poster.jpg", { cf: { cacheTtl: 86400, cacheEverything: true } });
        return new Response(fb.body, {
          status: fb.ok ? 200 : 404,
          headers: { "content-type": fb.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=3600", "x-robots-tag": "noindex" },
        });
      }
      return new Response(up.body, {
        status: 200,
        headers: { "content-type": up.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=86400", "x-robots-tag": "noindex" },
      });
    };

    if (path === "/robots.txt") {
      return new Response(
        "User-agent: *\nDisallow: /\n\nUser-agent: Twitterbot\nAllow: /\n\nUser-agent: TelegramBot\nAllow: /\n\nUser-agent: facebookexternalhit\nAllow: /\n",
        { headers: { "content-type": "text/plain; charset=utf-8" } }
      );
    }
    if (path === "/favicon.ico" || path === "/favicon.svg") {
      return Response.redirect(CANONICAL + "/favicon.svg", 302);
    }
    const media = path.match(/^\/media\/(.+?)\.jpg$/);
    if (media) {
      const id = decodeURIComponent(media[1]);
      if (id === "home") return proxyOg("brand-home");
      return proxyOg(id);
    }

    try {
      if (path === "/" || path === "/index.html") {
        const items = await latest();
        const cards = items
          .map((it) => {
            const href = "/v/" + encodeURIComponent(it.id);
            const img = origin + "/media/" + encodeURIComponent(it.id) + ".jpg";
            return '<a class="card" href="' + esc(href) + '"><img src="' + esc(img) + '" alt="" width="160" height="90" loading="lazy"/><h2>' + esc(it.title) + "</h2></a>";
          })
          .join("");
        const body =
          '<p class="note">Daftar video terbaru. Buka kartu ini dulu kalau koleksidrpinguin.com terkunci di jaringanmu, lalu lanjut ke halaman tonton.</p><div class="grid">' +
          (cards || '<p class="note">Belum ada daftar. Coba buka situs utama.</p>') +
          "</div>";
        return htmlRes(
          page(
            "Koleksi Dr. Pinguin — Anti Blokir / tanpa VPN",
            CANONICAL + "/",
            "Pintu masuk anti blokir, tanpa VPN, ke katalog Koleksi Dr. Pinguin. Konten dewasa 18+.",
            origin + "/media/home.jpg",
            body
          )
        );
      }
      const video = path.match(/^\/v\/([^/]+)\/?$/);
      if (video) {
        const id = decodeURIComponent(video[1]);
        const items = await latest().catch(() => []);
        const item = items.find((it) => it.id === id) || { id, title: "Video Koleksi Dr. Pinguin" };
        const watch = CANONICAL + "/watch/" + encodeURIComponent(id);
        const img = origin + "/media/" + encodeURIComponent(id) + ".jpg";
        const title = item.title || "Video Koleksi Dr. Pinguin";
        const body =
          '<article class="hero"><img src="' + esc(img) + '" alt=""/><h1>' + esc(title) +
          '</h1><p class="note">Anti Blokir / tanpa VPN. Video diputar di situs utama.</p><a class="btn" href="' +
          esc(watch) + '" rel="noopener">Tonton di koleksidrpinguin.com</a></article>';
        return htmlRes(page(title + " — Anti Blokir", watch, "Tonton di Koleksi Dr. Pinguin. Pintu anti blokir / tanpa VPN. 18+.", img, body));
      }
    } catch (e) {
      const body =
        '<p class="note">Daftar lagi tidak bisa dimuat. Buka langsung situs utama.</p><a class="btn" href="' +
        esc(CANONICAL) + '">Ke koleksidrpinguin.com</a>';
      return htmlRes(page("Koleksi Dr. Pinguin — Anti Blokir / tanpa VPN", CANONICAL + "/", "Pintu masuk anti blokir ke Koleksi Dr. Pinguin.", "", body), 503);
    }
    return new Response(null, { status: 302, headers: { location: "/" } });
  },
};
