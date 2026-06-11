const fs = require("fs");
const path = require("path");
const PocketBase = require("pocketbase/cjs");

const CONFIG_PATH = path.join(__dirname, "..", "pocketbase", "config.json");

function readConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

/** Superuser olarak doğrulanmış bir PocketBase istemcisi döner. */
async function createSuperuserClient() {
  const config = readConfig();
  const pb = new PocketBase(config.url);
  pb.autoCancellation(false);
  await pb.collection("_superusers").authWithPassword(config.adminEmail, config.adminPassword);
  return pb;
}

module.exports = { readConfig, createSuperuserClient, CONFIG_PATH };
