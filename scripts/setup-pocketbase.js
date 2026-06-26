/**
 * PocketBase koleksiyon şemalarını oluşturur (varsa atlar).
 * Kullanım: node scripts/setup-pocketbase.js
 */
const { createSuperuserClient } = require("./pb-common");

const JSON_MAX_SIZE = 5 * 1024 * 1024; // 5MB — uzun mesaj thread'leri için

const COLLECTIONS = [
  {
    name: "users",
    fields: [
      { name: "appId", type: "text", required: true },
      { name: "email", type: "text", required: true },
      { name: "passwordHash", type: "text" },
      { name: "data", type: "json", maxSize: JSON_MAX_SIZE },
      { name: "sortIndex", type: "number" }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_users_appId ON users (appId)"]
  },
  {
    name: "departments",
    fields: [
      { name: "name", type: "text", required: true },
      { name: "sortIndex", type: "number" }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_departments_name ON departments (name)"]
  },
  {
    name: "tasks",
    fields: [
      { name: "appId", type: "text", required: true },
      { name: "data", type: "json", maxSize: JSON_MAX_SIZE },
      { name: "sortIndex", type: "number" }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_tasks_appId ON tasks (appId)"]
  },
  {
    name: "requests",
    fields: [
      { name: "appId", type: "text", required: true },
      { name: "data", type: "json", maxSize: JSON_MAX_SIZE },
      { name: "sortIndex", type: "number" }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_requests_appId ON requests (appId)"]
  },
  {
    name: "messages",
    fields: [
      { name: "appId", type: "text", required: true },
      { name: "data", type: "json", maxSize: JSON_MAX_SIZE },
      { name: "sortIndex", type: "number" }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_messages_appId ON messages (appId)"]
  },
  {
    name: "user_photos",
    fields: [
      { name: "userId", type: "text", required: true },
      // PocketBase max:0'da varsayılan 5000 uygular; base64 avatarlar 250KB+ olabildiği için yüksek limit
      { name: "avatar", type: "text", max: 2000000 },
      { name: "sortIndex", type: "number" }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_user_photos_userId ON user_photos (userId)"]
  },
  {
    name: "intern_portfolios",
    fields: [
      { name: "appId", type: "text", required: true },
      { name: "data", type: "json", maxSize: JSON_MAX_SIZE },
      { name: "sortIndex", type: "number" }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_intern_portfolios_appId ON intern_portfolios (appId)"]
  }
];

async function main() {
  const pb = await createSuperuserClient();
  const existing = await pb.collections.getFullList();
  const existingNames = new Set(existing.map((c) => c.name));

  for (const def of COLLECTIONS) {
    if (existingNames.has(def.name)) {
      console.log(`[atlandi] ${def.name} zaten var`);
      continue;
    }
    await pb.collections.create({
      name: def.name,
      type: "base",
      fields: def.fields,
      indexes: def.indexes
      // listRule/viewRule vb. null bırakıldı => yalnızca superuser erişebilir.
    });
    console.log(`[olusturuldu] ${def.name}`);
  }
  console.log("Kurulum tamamlandı.");
}

main().catch((err) => {
  console.error("Kurulum hatası:", err?.response || err);
  process.exit(1);
});
