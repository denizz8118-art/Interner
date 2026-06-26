/**
 * Stitch projesindeki tüm ekran HTML'lerini docs/stitch/ altına indirir.
 * Kullanım: node scripts/fetch-all-stitch-screens.js
 */
const fs = require("fs");
const path = require("path");

const PROJECT_ID = "5492229529809928029";

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [name, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (name && process.env[name] == null) process.env[name] = value;
  }
}

function readKeyFromCursorMcp() {
  const configPath = path.join(process.env.USERPROFILE || "C:/Users/3bfab", ".cursor", "mcp.json");
  if (!fs.existsSync(configPath)) return "";
  const mcp = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return mcp?.mcpServers?.stitch?.env?.STITCH_API_KEY || "";
}

loadDotEnv(path.join(__dirname, "..", ".env.stitch"));

async function mcpCall(key, method, params) {
  const body = { jsonrpc: "2.0", id: 1, method, params };
  const res = await fetch("https://stitch.googleapis.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify(body)
  });
  return res.json();
}

function slug(title) {
  return String(title || "screen")
    .toLowerCase()
    .replace(/[^a-z0-9ğüşıöç]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function main() {
  const key = process.env.STITCH_API_KEY || readKeyFromCursorMcp();
  if (!key) throw new Error("STITCH_API_KEY bulunamadı.");

  const outDir = path.join(__dirname, "..", "docs", "stitch", "screens");
  fs.mkdirSync(outDir, { recursive: true });

  const listRes = await mcpCall(key, "tools/call", {
    name: "list_screens",
    arguments: { projectId: PROJECT_ID }
  });

  const screens = JSON.parse(listRes?.result?.content?.[0]?.text || "{}").screens || [];
  const index = [];

  for (const screen of screens) {
    const name = screen.name || "";
    const screenId = name.split("/screens/")[1];
    if (!screenId) continue;

    const htmlUrl = screen.htmlCode?.downloadUrl;
    const title = screen.title || screenId;
    const fileBase = `${slug(title)}-${screenId.slice(0, 8)}`;

    if (htmlUrl) {
      try {
        const htmlRes = await fetch(htmlUrl);
        const html = await htmlRes.text();
        fs.writeFileSync(path.join(outDir, `${fileBase}.html`), html);
        index.push({ title, screenId, file: `${fileBase}.html` });
        console.log(`[ok] ${title}`);
      } catch (e) {
        console.warn(`[fail] ${title}:`, e.message);
      }
    }
  }

  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 2));
  console.log(`Tamamlandı: ${index.length} ekran → docs/stitch/screens/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
