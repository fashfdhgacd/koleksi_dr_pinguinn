import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMessage, detectCategory, cleanTitle } from "./lib/parse.js";
import { toRecord, upsertVideo } from "./lib/store.js";
import { fetchPutarinTitle, fetchStreamtapeTitle } from "./lib/providers.js";
import { pushJsonToGithub } from "./lib/github.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  try {
    const raw = readFileSync(path.join(__dirname, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    // .env optional if env already injected
  }
}

loadDotEnv();

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ALLOWED = new Set(
  String(process.env.AUTHORIZED_USER_IDS || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
);
const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || "./data");
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN kosong. Isi file .env");
  process.exit(1);
}

async function tg(method, payload) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || method);
  return data.result;
}

function allowed(msg) {
  if (ALLOWED.size === 0) return false;
  const id = String(msg.from?.id || "");
  return ALLOWED.has(id);
}

async function resolveTitle(parsed, givenTitle) {
  if (givenTitle && givenTitle !== "Video") return givenTitle;
  if (parsed.host === "putarin") {
    const t = await fetchPutarinTitle(parsed.id, process.env);
    if (t) return cleanTitle(t);
  }
  if (parsed.host === "streamtape") {
    const t = await fetchStreamtapeTitle(parsed.id, process.env);
    if (t) return cleanTitle(t);
  }
  return givenTitle || "Video";
}

async function handleText(msg) {
  const chatId = msg.chat.id;
  if (!allowed(msg)) {
    await tg("sendMessage", { chat_id: chatId, text: "❌ Tidak diizinkan." });
    return;
  }

  const text = msg.text || msg.caption || "";
  if (text.startsWith("/start")) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: [
        "Kirim link Streamtape atau Putarin.",
        "",
        "Format:",
        "Judul: Tante Viral Hotel",
        "Kategori: tante",
        "https://streamtape.com/e/xxxxx",
        "",
        "Atau link saja. Boleh lebih dari 1 link.",
      ].join("\n"),
    });
    return;
  }

  const parsedMsg = parseMessage(text);
  if (!parsedMsg.videos.length) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "❌ Tidak ada link Streamtape / Putarin yang valid.",
    });
    return;
  }

  const lines = [];
  for (const video of parsedMsg.videos) {
    const title = await resolveTitle(video, parsedMsg.title);
    const category = parsedMsg.category || detectCategory(title);
    const record = toRecord({ parsed: video, title, category });
    const fileName = video.file;
    const filePath = path.join(DATA_DIR, fileName);
    const result = await upsertVideo(filePath, record);

    try {
      const json = await fs.readFile(filePath, "utf8");
      await pushJsonToGithub(process.env, fileName, json);
    } catch (err) {
      console.error("github push", err.message);
    }

    const mark = result.action === "created" ? "✅" : "♻️";
    lines.push(
      [
        `${mark} ${result.action.toUpperCase()}`,
        `Judul: ${record.title}`,
        `ID: ${record.id}`,
        `Source: ${record.source}`,
        `Kategori: ${record.category}`,
        `File: data/${fileName}`,
        `Total: ${result.total}`,
      ].join("\n")
    );
  }

  await tg("sendMessage", { chat_id: chatId, text: lines.join("\n\n") });
}

async function poll() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  for (const name of ["videos.json", "putarin.json", "campur.json"]) {
    const p = path.join(DATA_DIR, name);
    try {
      await fs.access(p);
    } catch {
      await fs.writeFile(p, "[]\n", "utf8");
    }
  }

  console.log("Bot jalan. JSON folder:", DATA_DIR);
  let offset = 0;
  for (;;) {
    try {
      const updates = await tg("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message"],
      });
      for (const upd of updates) {
        offset = upd.update_id + 1;
        if (upd.message) await handleText(upd.message);
      }
    } catch (err) {
      console.error("poll", err.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

poll();
