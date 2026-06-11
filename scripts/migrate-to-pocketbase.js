/**
 * data/*.json dosyalarını PocketBase'e taşır.
 * - Önce data/ klasörünün zaman damgalı yedeğini alır (rollback garantisi).
 * - Kullanıcı şifrelerini bcrypt ile hashler; düz metin şifre veritabanına yazılmaz.
 * - Aynı appId ile kayıt varsa atlar (idempotent — tekrar çalıştırılabilir).
 * Kullanım: node scripts/migrate-to-pocketbase.js
 */
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { createSuperuserClient } = require("./pb-common");

const dataDir = path.join(__dirname, "..", "data");

function readJson(name) {
  const filePath = path.join(dataDir, name);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "").trim();
    return raw ? JSON.parse(raw) : [];
  } catch (_e) {
    return [];
  }
}

function backupDataDir() {
  if (!fs.existsSync(dataDir)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(__dirname, "..", `data_backup_${stamp}`);
  // Not: fs.cpSync bu ortamda (Node 24 + Windows) çöktüğü için dosyalar tek tek kopyalanıyor.
  fs.mkdirSync(backupDir, { recursive: true });
  for (const name of fs.readdirSync(dataDir)) {
    const src = path.join(dataDir, name);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(backupDir, name));
    }
  }
  return backupDir;
}

async function existingAppIds(pb, collection, idField = "appId") {
  const records = await pb.collection(collection).getFullList({ fields: `id,${idField}` });
  return new Set(records.map((r) => String(r[idField])));
}

async function migrateGeneric(pb, collection, items, getAppId) {
  const existing = await existingAppIds(pb, collection);
  let created = 0;
  let index = 0;
  for (const item of items) {
    const appId = String(getAppId(item) ?? "").trim();
    index += 1;
    if (!appId || existing.has(appId)) continue;
    await pb.collection(collection).create({ appId, data: item, sortIndex: index });
    created += 1;
  }
  console.log(`[${collection}] ${created} kayıt eklendi (${items.length} kaynak)`);
}

async function migrateUsers(pb, users) {
  const existing = await existingAppIds(pb, "users");
  let created = 0;
  let index = 0;
  for (const user of users) {
    index += 1;
    const appId = String(user?.id ?? "").trim();
    if (!appId || existing.has(appId)) continue;
    const { sifre, ...rest } = user;
    const passwordHash = sifre ? bcrypt.hashSync(String(sifre), 10) : "";
    await pb.collection("users").create({
      appId,
      email: String(user?.email || "").trim().toLowerCase(),
      passwordHash,
      data: rest,
      sortIndex: index
    });
    created += 1;
  }
  console.log(`[users] ${created} kayıt eklendi (${users.length} kaynak), şifreler bcrypt ile hashlendi`);
}

async function migrateDepartments(pb, departments) {
  const records = await pb.collection("departments").getFullList({ fields: "id,name" });
  const existing = new Set(records.map((r) => r.name));
  let created = 0;
  let index = 0;
  for (const dep of departments) {
    index += 1;
    const name = String(dep || "").trim();
    if (!name || existing.has(name)) continue;
    await pb.collection("departments").create({ name, sortIndex: index });
    created += 1;
  }
  console.log(`[departments] ${created} kayıt eklendi (${departments.length} kaynak)`);
}

async function migrateUserPhotos(pb, photos) {
  const records = await pb.collection("user_photos").getFullList({ fields: "id,userId" });
  const existing = new Set(records.map((r) => String(r.userId)));
  let created = 0;
  let index = 0;
  for (const photo of photos) {
    index += 1;
    const userId = String(photo?.userId ?? "").trim();
    if (!userId || existing.has(userId)) continue;
    await pb.collection("user_photos").create({
      userId,
      avatar: String(photo?.avatar || ""),
      sortIndex: index
    });
    created += 1;
  }
  console.log(`[user_photos] ${created} kayıt eklendi (${photos.length} kaynak)`);
}

async function main() {
  const backupDir = backupDataDir();
  if (backupDir) console.log(`Yedek alındı: ${backupDir}`);

  const pb = await createSuperuserClient();

  await migrateUsers(pb, readJson("users.json"));
  await migrateDepartments(pb, readJson("departments.json"));
  await migrateGeneric(pb, "tasks", readJson("tasks.json"), (t) => t?.id);
  await migrateGeneric(pb, "requests", readJson("requests.json"), (r) => r?.id);
  await migrateGeneric(pb, "messages", readJson("messages.json"), (m) => m?.id);
  await migrateUserPhotos(pb, readJson("user_photos.json"));

  console.log("Taşıma tamamlandı.");
}

main().catch((err) => {
  console.error("Taşıma hatası:", err?.response || err);
  process.exit(1);
});
