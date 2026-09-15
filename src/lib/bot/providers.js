async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, redirect: "follow" });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: res.status, data: null, raw: text.slice(0, 200) };
  }
}

function decodeEntities(s = "") {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

/** Ambil judul dari <title> halaman embed Puterin kalau API key kosong. */
async function scrapePutarinTitle(code) {
  if (!code) return "";
  const urls = [
    `https://puterin.biz/e/${encodeURIComponent(code)}`,
    `https://panel.putarin.com/e/${encodeURIComponent(code)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: "text/html",
          "user-agent": "Mozilla/5.0 (compatible; kdp-bot/1.0)",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const m = html.match(/<title>([^<]+)<\/title>/i);
      if (!m) continue;
      let title = decodeEntities(m[1]);
      title = title
        .replace(/\s*[·|].*putarin.*$/i, "")
        .replace(/\s*[-–].*puterin.*$/i, "")
        .trim();
      if (!title || /tidak ditemukan|not found|^video$/i.test(title)) continue;
      return title;
    } catch {
      /* try next */
    }
  }
  return "";
}

export async function fetchPutarinTitle(code, env) {
  const key = env.PUTARIN_API_KEY;
  const base = (env.PUTARIN_API_BASE || "https://panel.putarin.com/api/dev").replace(/\/$/, "");
  if (key && code) {
    const { ok, data } = await getJson(`${base}/video/${encodeURIComponent(code)}`, {
      "X-API-Key": key,
      Accept: "application/json",
    });
    if (ok && data) {
      const t = String(data.video?.title || data.title || data.data?.title || "").trim();
      if (t) return t;
    }
  }
  return scrapePutarinTitle(code);
}

export async function fetchPutarinMeta(code, env) {
  const key = env.PUTARIN_API_KEY;
  const base = (env.PUTARIN_API_BASE || "https://panel.putarin.com/api/dev").replace(/\/$/, "");
  let title = "";
  let thumb = "";
  if (key && code) {
    const { ok, data } = await getJson(`${base}/video/${encodeURIComponent(code)}`, {
      "X-API-Key": key,
      Accept: "application/json",
    });
    if (ok && data) {
      const v = data.video || data.data || data;
      title = String(v?.title || data.title || "").trim();
      thumb = String(
        v?.poster || v?.thumbnail || v?.thumb || v?.image || data.poster || data.thumbnail || "",
      ).trim();
    }
  }
  if (!title) title = await scrapePutarinTitle(code);
  return { title, thumb };
}

export async function fetchStreamtapeTitle(fileId, env) {
  const login = env.STREAMTAPE_LOGIN;
  const key = env.STREAMTAPE_KEY;
  const api = (env.STREAMTAPE_API || "https://api.streamtape.com").replace(/\/$/, "");
  if (!login || !key || !fileId) return "";
  const url = `${api}/file/info?file=${encodeURIComponent(fileId)}&login=${encodeURIComponent(login)}&key=${encodeURIComponent(key)}`;
  const { ok, data } = await getJson(url);
  if (!ok || !data || data.status !== 200) return "";
  const info = data.result?.[fileId] || data.result;
  return String(info?.name || info?.title || "").replace(/\.[a-z0-9]+$/i, "").trim();
}
