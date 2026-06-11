const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const bcrypt = require("bcryptjs");
const PocketBase = require("pocketbase/cjs");
const { EventSource } = require("eventsource");

// PocketBase realtime (SSE) Node ortamında global EventSource bekler.
if (!globalThis.EventSource) {
  globalThis.EventSource = EventSource;
}

// Bazı Windows profillerinde Electron cache dizinlerine yazma engeli olabiliyor.
// Uygulamayı daha stabil başlatmak için cache'i devre dışı bırakıp userData'yı temp'e taşıyoruz.
app.commandLine.appendSwitch("disable-http-cache");
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-gpu-program-cache");
app.setPath("userData", path.join(app.getPath("temp"), "InternerElectronData"));

// ---------------------------------------------------------------------------
// PocketBase sunucu yönetimi
// ---------------------------------------------------------------------------

const PB_DIR = path.join(__dirname, "pocketbase");
const PB_EXE = path.join(PB_DIR, "pocketbase.exe");
const PB_DATA_DIR = path.join(PB_DIR, "pb_data");
const PB_CONFIG_PATH = path.join(PB_DIR, "config.json");

let pbConfig = null;
let pbProcess = null;
let pb = null;

function readPbConfig() {
  const raw = fs.readFileSync(PB_CONFIG_PATH, "utf-8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

async function isPbHealthy(url) {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch (_e) {
    return false;
  }
}

/** PocketBase çalışmıyorsa kendi child process'imiz olarak başlatır. */
async function ensurePocketBaseRunning(url) {
  if (await isPbHealthy(url)) return;

  const httpAddr = url.replace(/^https?:\/\//, "");
  pbProcess = spawn(PB_EXE, ["serve", "--dir", PB_DATA_DIR, "--http", httpAddr], {
    stdio: "ignore",
    windowsHide: true
  });
  pbProcess.on("exit", () => {
    pbProcess = null;
  });

  for (let i = 0; i < 40; i++) {
    if (await isPbHealthy(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("PocketBase sunucusu başlatılamadı.");
}

async function initPocketBase() {
  pbConfig = readPbConfig();
  await ensurePocketBaseRunning(pbConfig.url);
  pb = new PocketBase(pbConfig.url);
  pb.autoCancellation(false);
  await pb.collection("_superusers").authWithPassword(pbConfig.adminEmail, pbConfig.adminPassword);
}

/** Token süresi dolduysa yeniden doğrular. */
async function ensureAuth() {
  if (!pb.authStore.isValid) {
    await pb.collection("_superusers").authWithPassword(pbConfig.adminEmail, pbConfig.adminPassword);
  }
}

// ---------------------------------------------------------------------------
// Veri yardımcıları
// ---------------------------------------------------------------------------

const DEFAULT_CALISMA_SAATI = "09:00 - 18:00";

/** Profil fotoğrafı base64 vb. kullanıcı kaydına yazılmaz (user_photos koleksiyonunda tutulur). */
function stripProfilFoto(user) {
  if (!user || typeof user !== "object") return user;
  const { profilFoto, ...rest } = user;
  return rest;
}

function ensureCalismaSaati(user) {
  const u = { ...user };
  const cs = String(u.calismaSaati || "").trim();
  if (!cs) u.calismaSaati = DEFAULT_CALISMA_SAATI;
  return u;
}

/** Kullanıcı objesini kayda hazırlar: foto ve düz metin şifre asla saklanmaz. */
function userForStore(user) {
  const { sifre, ...rest } = ensureCalismaSaati(stripProfilFoto(user));
  return rest;
}

/** Bir koleksiyondaki tüm kayıtların `data` alanını dizi olarak döner (orijinal JSON dizisi eşleniği). */
async function listData(collection) {
  await ensureAuth();
  const records = await pb.collection(collection).getFullList({ sort: "sortIndex" });
  return records.map((r) => r.data);
}

/**
 * Dizinin tamamını koleksiyonla eşitler (renderer "toplu kaydet" modeliyle çalışıyor):
 * yeni öğeler eklenir, mevcutlar güncellenir, listede olmayanlar silinir, sıra korunur.
 */
async function saveWholesale(collection, items, getAppId) {
  await ensureAuth();
  if (!Array.isArray(items)) {
    throw new Error("Geçersiz veri listesi.");
  }
  const records = await pb.collection(collection).getFullList();
  const byAppId = new Map(records.map((r) => [String(r.appId), r]));
  const incomingIds = new Set();

  let index = 0;
  for (const item of items) {
    index += 1;
    const appId = String(getAppId(item) ?? "").trim();
    if (!appId) continue;
    incomingIds.add(appId);

    const existing = byAppId.get(appId);
    const payload = { appId, data: item, sortIndex: index };

    if (!existing) {
      await pb.collection(collection).create(payload);
    } else if (JSON.stringify(existing.data) !== JSON.stringify(payload.data) || existing.sortIndex !== index) {
      await pb.collection(collection).update(existing.id, payload);
    }
  }

  for (const [appId, record] of byAppId) {
    if (!incomingIds.has(appId)) {
      await pb.collection(collection).delete(record.id);
    }
  }
  return items.length;
}

/** users koleksiyonu için toplu kayıt: şifre geldiyse hashlenir, gelmediyse mevcut hash korunur. */
async function saveUsersToDb(nextUsers) {
  await ensureAuth();
  const records = await pb.collection("users").getFullList();
  const byAppId = new Map(records.map((r) => [String(r.appId), r]));
  const incomingIds = new Set();

  let index = 0;
  const storedUsers = [];
  for (const rawUser of nextUsers) {
    index += 1;
    const clean = userForStore(rawUser);
    const appId = String(clean?.id ?? "").trim();
    if (!appId) continue;
    incomingIds.add(appId);

    const existing = byAppId.get(appId);
    const payload = {
      appId,
      email: String(clean?.email || "").trim().toLowerCase(),
      data: clean,
      sortIndex: index,
      passwordHash: existing?.passwordHash || ""
    };
    const sifre = rawUser?.sifre;
    if (sifre !== undefined && sifre !== null && String(sifre) !== "") {
      payload.passwordHash = bcrypt.hashSync(String(sifre), 10);
    }

    if (!existing) {
      await pb.collection("users").create(payload);
    } else if (
      JSON.stringify(existing.data) !== JSON.stringify(payload.data) ||
      existing.sortIndex !== index ||
      existing.email !== payload.email ||
      existing.passwordHash !== payload.passwordHash
    ) {
      await pb.collection("users").update(existing.id, payload);
    }
    storedUsers.push(clean);
  }

  for (const [appId, record] of byAppId) {
    if (!incomingIds.has(appId)) {
      await pb.collection("users").delete(record.id);
    }
  }
  return storedUsers;
}

async function findUserRecordByEmail(email) {
  await ensureAuth();
  try {
    return await pb
      .collection("users")
      .getFirstListItem(pb.filter("email = {:email}", { email: String(email || "").trim().toLowerCase() }));
  } catch (_e) {
    return null;
  }
}

async function createUserRecord(rawUser) {
  await ensureAuth();
  const clean = userForStore(rawUser);
  const records = await pb.collection("users").getFullList({ fields: "id,sortIndex" });
  const maxSort = records.reduce((max, r) => Math.max(max, Number(r.sortIndex) || 0), 0);
  const sifre = rawUser?.sifre;
  await pb.collection("users").create({
    appId: String(clean?.id ?? "").trim(),
    email: String(clean?.email || "").trim().toLowerCase(),
    passwordHash: sifre ? bcrypt.hashSync(String(sifre), 10) : "",
    data: clean,
    sortIndex: maxSort + 1
  });
  return clean;
}

// ---------------------------------------------------------------------------
// IPC handler'ları
// ---------------------------------------------------------------------------

function safeHandle(channel, handler) {
  try {
    ipcMain.removeHandler(channel);
  } catch (_error) {
    // No previous handler.
  }
  ipcMain.handle(channel, handler);
}

function registerIpcHandlers() {
  safeHandle("auth:login", async (_event, payload) => {
    try {
      const email = String(payload?.email || "").trim().toLowerCase();
      const password = String(payload?.password || "");
      const record = await findUserRecordByEmail(email);
      if (!record) {
        return { ok: false, error: "E-posta veya şifre hatalı." };
      }
      const hash = String(record.passwordHash || "");
      const matches = hash ? bcrypt.compareSync(password, hash) : password === "";
      if (!matches) {
        return { ok: false, error: "E-posta veya şifre hatalı." };
      }
      return { ok: true, user: record.data };
    } catch (error) {
      return { ok: false, error: error?.message || "Giriş sırasında hata oluştu." };
    }
  });

  safeHandle("users:list", async () => {
    try {
      return await listData("users");
    } catch (_e) {
      return [];
    }
  });

  safeHandle("users:save", async (_event, nextUsers) => {
    try {
      if (!Array.isArray(nextUsers)) {
        return { ok: false, error: "Geçersiz kullanıcı listesi." };
      }
      const stored = await saveUsersToDb(nextUsers);
      await broadcastUsersToRenderers();
      return { ok: true, count: stored.length };
    } catch (error) {
      return { ok: false, error: error?.message || "Kullanıcılar kaydedilemedi." };
    }
  });

  safeHandle("departments:list", async () => {
    try {
      await ensureAuth();
      const records = await pb.collection("departments").getFullList({ sort: "sortIndex" });
      return records.map((r) => r.name);
    } catch (_e) {
      return [];
    }
  });

  safeHandle("departments:save", async (_event, departments) => {
    try {
      if (!Array.isArray(departments)) {
        return { ok: false, error: "Geçersiz departman listesi." };
      }
      await ensureAuth();
      const cleaned = departments.map((d) => String(d || "").trim()).filter(Boolean);
      const records = await pb.collection("departments").getFullList();
      const byName = new Map(records.map((r) => [r.name, r]));
      const incoming = new Set(cleaned);

      let index = 0;
      for (const name of cleaned) {
        index += 1;
        const existing = byName.get(name);
        if (!existing) {
          await pb.collection("departments").create({ name, sortIndex: index });
        } else if (existing.sortIndex !== index) {
          await pb.collection("departments").update(existing.id, { sortIndex: index });
        }
      }
      for (const [name, record] of byName) {
        if (!incoming.has(name)) {
          await pb.collection("departments").delete(record.id);
        }
      }
      return { ok: true, count: cleaned.length };
    } catch (error) {
      return { ok: false, error: error?.message || "Departmanlar kaydedilemedi." };
    }
  });

  safeHandle("users:add", async (_event, newUser) => {
    try {
      const email = String(newUser?.email || "").trim().toLowerCase();
      if (!email) {
        return { ok: false, error: "E-posta zorunludur." };
      }
      if (await findUserRecordByEmail(email)) {
        return { ok: false, error: "Bu e-posta zaten kayıtlı." };
      }
      const nextUser = { ...newUser, email };
      nextUser.ad_soyad = String(newUser?.ad_soyad || `${newUser?.ad || ""} ${newUser?.soyad || ""}`.trim() || "-");
      delete nextUser.ad;
      delete nextUser.soyad;
      const stored = await createUserRecord(nextUser);
      await broadcastUsersToRenderers();
      return { ok: true, user: stored };
    } catch (error) {
      return { ok: false, error: error?.message || "Kullanıcı eklenemedi." };
    }
  });

  safeHandle("users:create", async (_event, payload) => {
    try {
      const email = String(payload?.email || "").trim().toLowerCase();
      if (!email) return { ok: false, error: "E-posta zorunludur." };
      if (await findUserRecordByEmail(email)) {
        return { ok: false, error: "Bu e-posta zaten kayıtlı." };
      }
      const nextUser = {
        id: String(payload?.id || Date.now()),
        ad_soyad: String(payload?.ad_soyad || `${payload?.ad || ""} ${payload?.soyad || ""}`.trim() || "-"),
        email,
        sifre: String(payload?.sifre || ""),
        rol: String(payload?.rol || "STAJYER"),
        departman: String(payload?.departman || "Genel"),
        sirketUnvan: String(payload?.sirketUnvan || "Stajyer"),
        telefon: String(payload?.telefon || "***")
      };
      const stored = await createUserRecord(nextUser);
      await broadcastUsersToRenderers();

      const persisted = await findUserRecordByEmail(email);
      if (!persisted) return { ok: false, error: "Kullanıcı veritabanına yazılamadı." };
      return { ok: true, user: stored };
    } catch (error) {
      return { ok: false, error: error?.message || "Kullanıcı oluşturulamadı." };
    }
  });

  safeHandle("auth:register", async (_event, payload) => {
    try {
      const email = String(payload?.email || "").trim().toLowerCase();
      if (!email) {
        return { ok: false, error: "E-posta zorunludur." };
      }
      if (await findUserRecordByEmail(email)) {
        return { ok: false, error: "Bu e-posta zaten kayıtlı." };
      }
      const nextUser = { ...payload, email };
      nextUser.ad_soyad = String(payload?.ad_soyad || `${payload?.ad || ""} ${payload?.soyad || ""}`.trim() || "-");
      delete nextUser.ad;
      delete nextUser.soyad;
      const stored = await createUserRecord(nextUser);
      await broadcastUsersToRenderers();
      return { ok: true, user: stored };
    } catch (error) {
      return { ok: false, error: error?.message || "Kayıt sırasında hata oluştu." };
    }
  });

  safeHandle("users:delete", async (_event, userId) => {
    try {
      await ensureAuth();
      const records = await pb.collection("users").getFullList({ fields: "id,appId" });
      const target = records.find((r) => String(r.appId) === String(userId ?? ""));
      if (target) {
        await pb.collection("users").delete(target.id);
      }
      await broadcastUsersToRenderers();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Kullanıcı silinemedi." };
    }
  });

  safeHandle("tasks:list", async () => {
    try {
      return await listData("tasks");
    } catch (_e) {
      return [];
    }
  });

  safeHandle("tasks:save", async (_event, tasks) => {
    try {
      await saveWholesale("tasks", tasks, (t) => t?.id);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Görevler kaydedilemedi." };
    }
  });

  safeHandle("requests:list", async () => {
    try {
      return await listData("requests");
    } catch (_e) {
      return [];
    }
  });

  safeHandle("requests:save", async (_event, requests) => {
    try {
      await saveWholesale("requests", requests, (r) => r?.id);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Talepler kaydedilemedi." };
    }
  });

  safeHandle("messages:list", async () => {
    try {
      return await listData("messages");
    } catch (_e) {
      return [];
    }
  });

  safeHandle("messages:save", async (_event, messages) => {
    try {
      await saveWholesale("messages", messages, (m) => m?.id);
      await broadcastMessagesToRenderers();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Mesajlar kaydedilemedi." };
    }
  });

  safeHandle("userPhotos:list", async () => {
    try {
      await ensureAuth();
      const records = await pb.collection("user_photos").getFullList({ sort: "sortIndex" });
      return records.map((r) => ({ userId: r.userId, avatar: r.avatar }));
    } catch (_e) {
      return [];
    }
  });

  safeHandle("userPhotos:save", async (_event, photos) => {
    try {
      if (!Array.isArray(photos)) {
        return { ok: false, error: "Geçersiz avatar listesi." };
      }
      await ensureAuth();
      const cleaned = photos
        .map((p) => ({
          userId: String(p?.userId ?? "").trim(),
          avatar: String(p?.avatar ?? "").trim()
        }))
        .filter((p) => p.userId);

      const records = await pb.collection("user_photos").getFullList();
      const byUserId = new Map(records.map((r) => [String(r.userId), r]));
      const incoming = new Set(cleaned.map((p) => p.userId));

      let index = 0;
      for (const photo of cleaned) {
        index += 1;
        const existing = byUserId.get(photo.userId);
        if (!existing) {
          await pb.collection("user_photos").create({ ...photo, sortIndex: index });
        } else if (existing.avatar !== photo.avatar || existing.sortIndex !== index) {
          await pb.collection("user_photos").update(existing.id, { ...photo, sortIndex: index });
        }
      }
      for (const [userId, record] of byUserId) {
        if (!incoming.has(userId)) {
          await pb.collection("user_photos").delete(record.id);
        }
      }
      await broadcastUserPhotosToRenderers();
      return { ok: true, count: cleaned.length };
    } catch (error) {
      return { ok: false, error: error?.message || "Avatarlar kaydedilemedi." };
    }
  });
}

// ---------------------------------------------------------------------------
// Renderer yayınları + realtime
// ---------------------------------------------------------------------------

function sendToAllWindows(channel, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(channel, data);
    } catch (_e) {
      /* pencere kapanıyor olabilir */
    }
  }
}

async function broadcastMessagesToRenderers() {
  try {
    sendToAllWindows("messages:updated", await listData("messages"));
  } catch (_e) {
    /* veritabanına geçici erişim sorunu olabilir */
  }
}

async function broadcastUsersToRenderers() {
  try {
    sendToAllWindows("users:updated", await listData("users"));
  } catch (_e) {
    /* veritabanına geçici erişim sorunu olabilir */
  }
}

async function broadcastUserPhotosToRenderers() {
  try {
    await ensureAuth();
    const records = await pb.collection("user_photos").getFullList({ sort: "sortIndex" });
    sendToAllWindows("userPhotos:updated", records.map((r) => ({ userId: r.userId, avatar: r.avatar })));
  } catch (_e) {
    /* veritabanına geçici erişim sorunu olabilir */
  }
}

const realtimeTimers = {};

function debounceBroadcast(key, fn) {
  clearTimeout(realtimeTimers[key]);
  realtimeTimers[key] = setTimeout(fn, 150);
}

/** fs.watch'ın yerini alan canlı güncelleme: PocketBase realtime aboneliği.
 *  Başka bir uygulama örneği (veya admin paneli) veri değiştirdiğinde tüm pencereler güncellenir. */
async function startRealtimeSubscriptions() {
  try {
    await ensureAuth();
    await pb.collection("messages").subscribe("*", () => {
      debounceBroadcast("messages", broadcastMessagesToRenderers);
    });
    await pb.collection("users").subscribe("*", () => {
      debounceBroadcast("users", broadcastUsersToRenderers);
    });
    await pb.collection("user_photos").subscribe("*", () => {
      debounceBroadcast("userPhotos", broadcastUserPhotosToRenderers);
    });
  } catch (_e) {
    /* realtime isteğe bağlı; toplu kayıt sonrası yayınlar zaten çalışıyor */
  }
}

// ---------------------------------------------------------------------------
// Uygulama yaşam döngüsü
// ---------------------------------------------------------------------------

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#0D0F14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "login.html"));
}

app.whenReady().then(async () => {
  try {
    await initPocketBase();
  } catch (error) {
    dialog.showErrorBox(
      "Veritabanı Hatası",
      `PocketBase başlatılamadı: ${error?.message || error}\n\nLütfen pocketbase/config.json dosyasını ve pocketbase.exe'yi kontrol edin.`
    );
    app.quit();
    return;
  }
  registerIpcHandlers();
  startRealtimeSubscriptions();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  try {
    pb?.realtime?.unsubscribe();
  } catch (_e) {
    /* kapanış sırasında önemsiz */
  }
  if (pbProcess) {
    try {
      pbProcess.kill();
    } catch (_e) {
      /* zaten kapanmış olabilir */
    }
  }
});
