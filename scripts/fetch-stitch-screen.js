const fs = require("fs");
const path = require("path");

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

const key = process.env.STITCH_API_KEY || readKeyFromCursorMcp();
const outDir = path.join(__dirname, "..", "docs", "stitch");

async function main() {
  if (!key) {
    throw new Error("STITCH_API_KEY bulunamadi. .env.stitch dosyasina STITCH_API_KEY=... ekleyin.");
  }

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "get_screen",
      arguments: {
        name: "projects/5492229529809928029/screens/4fec7843e91842a484a9f1d15d4db5db",
        projectId: "5492229529809928029",
        screenId: "4fec7843e91842a484a9f1d15d4db5db"
      }
    }
  };

  const res = await fetch("https://stitch.googleapis.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(json, null, 2));

  const text = JSON.stringify(json);
  const htmlUrl = text.match(/"htmlCode"[\s\S]*?"downloadUrl"\s*:\s*"([^"]+)"/)?.[1];
  const imgUrl = text.match(/"screenshot"[\s\S]*?"downloadUrl"\s*:\s*"([^"]+)"/)?.[1];

  console.log("htmlUrl:", htmlUrl || "(yok)");
  console.log("imgUrl:", imgUrl || "(yok)");

  if (htmlUrl) {
    const htmlRes = await fetch(htmlUrl);
    const html = await htmlRes.text();
    fs.writeFileSync(path.join(outDir, "stajyerlerim-stitch.html"), html);
    console.log("HTML kaydedildi, byte:", html.length);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
