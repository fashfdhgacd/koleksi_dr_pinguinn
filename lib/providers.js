async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, redirect: "follow" });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: res.status, data: null, raw: text.slice(0, 200) };
  }
}

export async function fetchPutarinTitle(code, env) {
  const key = env.PUTARIN_API_KEY;
  const base = (env.PUTARIN_API_BASE || "https://panel.putarin.com/api/dev").replace(/\/$/, "");
  if (!key || !code) return "";
  const { ok, data } = await getJson(`${base}/video/${encodeURIComponent(code)}`, {
    "X-API-Key": key,
    Accept: "application/json",
  });
  if (!ok || !data) return "";
  return String(data.video?.title || data.title || data.data?.title || "").trim();
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
