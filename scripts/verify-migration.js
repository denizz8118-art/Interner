/**
 * Taşıma doğrulaması: yedek JSON kayıt sayıları ile PocketBase kayıt sayılarını
 * karşılaştırır ve örnek bir bcrypt login denemesi yapar.
 * Kullanım: node scripts/verify-migration.js <yedek_klasoru>
 */
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { createSuperuserClient } = require("./pb-common");

const backupDir = process.argv[2];
if (!backupDir) {
  console.error("Kullanım: node scripts/verify-migration.js <yedek_klasoru>");
  process.exit(1);
}

function readJson(name) {
  const filePath = path.join(backupDir, name);
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "").trim();
  return raw ? JSON.parse(raw) : [];
}

async function main() {
  const pb = await createSuperuserClient();
  const checks = [
    ["users", "users.json"],
    ["departments", "departments.json"],
    ["tasks", "tasks.json"],
    ["requests", "requests.json"],
    ["messages", "messages.json"],
    ["user_photos", "user_photos.json"]
  ];

  let allOk = true;
  for (const [collection, file] of checks) {
    const source = readJson(file);
    const records = await pb.collection(collection).getFullList({ fields: "id" });
    const ok = source.length === records.length;
    if (!ok) allOk = false;
    console.log(`[${ok ? "OK" : "HATA"}] ${collection}: kaynak=${source.length}, veritabani=${records.length}`);
  }

  // Düz metin şifre sızıntısı kontrolü: hiçbir kayıtta "sifre" alanı kalmamalı
  const userRecords = await pb.collection("users").getFullList();
  const leaked = userRecords.filter((r) => r.data && "sifre" in r.data);
  console.log(`[${leaked.length === 0 ? "OK" : "HATA"}] duz metin sifre alani: ${leaked.length} kayitta bulundu`);
  if (leaked.length > 0) allOk = false;

  // Örnek login denemeleri (yedek JSON'daki bilinen kullanıcılarla)
  const sourceUsers = readJson("users.json");
  for (const su of sourceUsers.slice(0, 3)) {
    const record = userRecords.find((r) => r.email === String(su.email).toLowerCase());
    const match = record ? bcrypt.compareSync(String(su.sifre), record.passwordHash || "") : false;
    console.log(`[${match ? "OK" : "HATA"}] login testi: ${su.email}`);
    if (!match) allOk = false;
  }

  console.log(allOk ? "\nDOGRULAMA BASARILI" : "\nDOGRULAMA BASARISIZ");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("Doğrulama hatası:", err?.response || err);
  process.exit(1);
});
