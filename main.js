const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
const usersPath = path.join(dataDir, "users.json");
const departmentsPath = path.join(dataDir, "departments.json");
const tasksPath = path.join(dataDir, "tasks.json");
const requestsPath = path.join(dataDir, "requests.json");
const messagesPath = path.join(dataDir, "messages.json");
const userPhotosPath = path.join(dataDir, "user_photos.json");

// Bazı Windows profillerinde Electron cache dizinlerine yazma engeli olabiliyor.
// Uygulamayı daha stabil başlatmak için cache'i devre dışı bırakıp userData'yı temp'e taşıyoruz.
app.commandLine.appendSwitch("disable-http-cache");
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-gpu-program-cache");
app.setPath("userData", path.join(app.getPath("temp"), "InternerElectronData"));

function ensureDataFiles() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(usersPath)) {
    fs.writeFileSync(usersPath, "[]", "utf-8");
  }
  if (!fs.existsSync(departmentsPath)) {
    fs.writeFileSync(departmentsPath, "[]", "utf-8");
  }
  if (!fs.existsSync(tasksPath)) {
    fs.writeFileSync(tasksPath, "[]", "utf-8");
  }
  if (!fs.existsSync(requestsPath)) {
    fs.writeFileSync(requestsPath, "[]", "utf-8");
  }
  if (!fs.existsSync(messagesPath)) {
    fs.writeFileSync(messagesPath, "[]", "utf-8");
  }
  if (!fs.existsSync(userPhotosPath)) {
    fs.writeFileSync(userPhotosPath, "[]", "utf-8");
  }
}

function parseJsonFile(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "").trim();
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  const content = JSON.stringify(value, null, 2);
  fs.writeFileSync(filePath, content, { encoding: "utf-8", flag: "w" });
  // Yazımı doğrula (dosyadan geri okuyup parse edebilmeli)
  const verify = parseJsonFile(filePath, null);
  if (verify === null) {
    throw new Error("JSON yazımı doğrulanamadı.");
  }
}

const DEFAULT_CALISMA_SAATI = "09:00 - 18:00";

/** Profil fotoğrafı base64 vb. diske yazılmaz; sadece oturum (localStorage) tarafında tutulabilir. */
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

function userForDisk(user) {
  return ensureCalismaSaati(stripProfilFoto(user));
}

function usersForDisk(list) {
  if (!Array.isArray(list)) return [];
  return list.map(userForDisk);
}

function safeHandle(channel, handler) {
  try {
    ipcMain.removeHandler(channel);
  } catch (_error) {
    // No previous handler.
  }
  ipcMain.handle(channel, handler);
}

function registerIpcHandlers() {
  safeHandle("auth:login", (_event, payload) => {
    const users = parseJsonFile(usersPath, []);
    const email = String(payload?.email || "").trim().toLowerCase();
    const password = String(payload?.password || "");
    const user = users.find(
      (item) => String(item.email || "").toLowerCase() === email && String(item.sifre || "") === password
    );
    if (!user) {
      return { ok: false, error: "E-posta veya şifre hatalı." };
    }
    return { ok: true, user };
  });

  safeHandle("users:list", () => {
    return parseJsonFile(usersPath, []);
  });

  safeHandle("users:save", (_event, nextUsers) => {
    try {
      if (!Array.isArray(nextUsers)) {
        return { ok: false, error: "Geçersiz kullanıcı listesi." };
      }
      const toWrite = usersForDisk(nextUsers);
      writeJsonFile(usersPath, toWrite);
      broadcastUsersToRenderers();
      return { ok: true, path: usersPath, count: toWrite.length };
    } catch (error) {
      return { ok: false, error: error?.message || "Kullanıcılar kaydedilemedi." };
    }
  });

  safeHandle("departments:list", () => {
    return parseJsonFile(departmentsPath, []);
  });

  safeHandle("users:add", (_event, newUser) => {
    try {
      const users = parseJsonFile(usersPath, []);
      const email = String(newUser?.email || "").trim().toLowerCase();
      if (!email) {
        return { ok: false, error: "E-posta zorunludur." };
      }
      const exists = users.some((item) => String(item.email || "").toLowerCase() === email);
      if (exists) {
        return { ok: false, error: "Bu e-posta zaten kayıtlı." };
      }
      let nextUser = {
        ...newUser,
        email,
        ad_soyad: String(newUser?.ad_soyad || `${newUser?.ad || ""} ${newUser?.soyad || ""}`.trim() || "-")
      };
      delete nextUser.ad;
      delete nextUser.soyad;
      nextUser = userForDisk(nextUser);
      users.push(nextUser);
      writeJsonFile(usersPath, users);
      broadcastUsersToRenderers();
      return { ok: true, user: nextUser, path: usersPath, count: users.length };
    } catch (error) {
      return { ok: false, error: error?.message || "Kullanıcı eklenemedi." };
    }
  });

  safeHandle("users:create", (_event, payload) => {
    try {
      const users = parseJsonFile(usersPath, []);
      const email = String(payload?.email || "").trim().toLowerCase();
      if (!email) return { ok: false, error: "E-posta zorunludur." };
      const exists = users.some((item) => String(item?.email || "").toLowerCase() === email);
      if (exists) return { ok: false, error: "Bu e-posta zaten kayıtlı." };

      let nextUser = {
        id: String(payload?.id || Date.now()),
        ad_soyad: String(payload?.ad_soyad || `${payload?.ad || ""} ${payload?.soyad || ""}`.trim() || "-"),
        email,
        sifre: String(payload?.sifre || ""),
        rol: String(payload?.rol || "STAJYER"),
        departman: String(payload?.departman || "Genel"),
        sirketUnvan: String(payload?.sirketUnvan || "Stajyer"),
        telefon: String(payload?.telefon || "***")
      };
      delete nextUser.ad;
      delete nextUser.soyad;
      nextUser = userForDisk(nextUser);

      const nextUsers = [...users, nextUser];
      writeJsonFile(usersPath, nextUsers);
      broadcastUsersToRenderers();
      const verifyUsers = parseJsonFile(usersPath, []);
      const persisted = verifyUsers.some((item) => String(item?.email || "").toLowerCase() === email);
      if (!persisted) return { ok: false, error: "Kullanıcı dosyaya yazılamadı." };

      return { ok: true, user: nextUser, path: usersPath, count: verifyUsers.length };
    } catch (error) {
      return { ok: false, error: error?.message || "Kullanıcı oluşturulamadı." };
    }
  });

  safeHandle("auth:register", (_event, payload) => {
    try {
      const users = parseJsonFile(usersPath, []);
      const email = String(payload?.email || "").trim().toLowerCase();
      if (!email) {
        return { ok: false, error: "E-posta zorunludur." };
      }
      const exists = users.some((item) => String(item.email || "").toLowerCase() === email);
      if (exists) {
        return { ok: false, error: "Bu e-posta zaten kayıtlı." };
      }
      let nextUser = {
        ...payload,
        email,
        ad_soyad: String(payload?.ad_soyad || `${payload?.ad || ""} ${payload?.soyad || ""}`.trim() || "-")
      };
      delete nextUser.ad;
      delete nextUser.soyad;
      nextUser = userForDisk(nextUser);
      users.push(nextUser);
      writeJsonFile(usersPath, users);
      broadcastUsersToRenderers();
      return { ok: true, user: nextUser, path: usersPath, count: users.length };
    } catch (error) {
      return { ok: false, error: error?.message || "Kayıt sırasında hata oluştu." };
    }
  });

  safeHandle("users:delete", (_event, userId) => {
    const users = parseJsonFile(usersPath, []);
    const nextUsers = users.filter((item) => String(item?.id ?? "") !== String(userId ?? ""));
    writeJsonFile(usersPath, usersForDisk(nextUsers));
    broadcastUsersToRenderers();
    return { ok: true };
  });

  safeHandle("tasks:list", () => {
    return parseJsonFile(tasksPath, []);
  });

  safeHandle("tasks:save", (_event, tasks) => {
    writeJsonFile(tasksPath, tasks);
    return { ok: true };
  });

  safeHandle("requests:list", () => {
    return parseJsonFile(requestsPath, []);
  });

  safeHandle("requests:save", (_event, requests) => {
    writeJsonFile(requestsPath, requests);
    return { ok: true };
  });

  safeHandle("messages:list", () => {
    return parseJsonFile(messagesPath, []);
  });

  safeHandle("messages:save", (_event, messages) => {
    writeJsonFile(messagesPath, messages);
    broadcastMessagesToRenderers();
    return { ok: true };
  });

  safeHandle("userPhotos:list", () => parseJsonFile(userPhotosPath, []));

  safeHandle("userPhotos:save", (_event, photos) => {
    try {
      if (!Array.isArray(photos)) {
        return { ok: false, error: "Geçersiz avatar listesi." };
      }
      const cleaned = photos
        .map((p) => ({
          userId: String(p?.userId ?? "").trim(),
          avatar: String(p?.avatar ?? "").trim()
        }))
        .filter((p) => p.userId);
      writeJsonFile(userPhotosPath, cleaned);
      broadcastUserPhotosToRenderers();
      return { ok: true, count: cleaned.length };
    } catch (error) {
      return { ok: false, error: error?.message || "Avatarlar kaydedilemedi." };
    }
  });
}

/** Tüm pencerelere güncel mesaj listesini ilet (çoklu pencere / dosya dışı değişiklik). */
function broadcastMessagesToRenderers() {
  const data = parseJsonFile(messagesPath, []);
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send("messages:updated", data);
    } catch (_e) {
      /* pencere kapanıyor olabilir */
    }
  }
}

function broadcastUsersToRenderers() {
  const data = parseJsonFile(usersPath, []);
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send("users:updated", data);
    } catch (_e) {
      /* pencere kapanıyor olabilir */
    }
  }
}

function broadcastUserPhotosToRenderers() {
  const data = parseJsonFile(userPhotosPath, []);
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send("userPhotos:updated", data);
    } catch (_e) {
      /* pencere kapanıyor olabilir */
    }
  }
}

let messagesWatchTimer = null;
let usersWatchTimer = null;
let userPhotosWatchTimer = null;

function startMessagesFileWatcher() {
  try {
    fs.watch(messagesPath, { persistent: true }, () => {
      clearTimeout(messagesWatchTimer);
      messagesWatchTimer = setTimeout(broadcastMessagesToRenderers, 120);
    });
  } catch (_e) {
    /* izleme isteğe bağlı */
  }
}

function startUsersFileWatcher() {
  try {
    fs.watch(usersPath, { persistent: true }, () => {
      clearTimeout(usersWatchTimer);
      usersWatchTimer = setTimeout(broadcastUsersToRenderers, 120);
    });
  } catch (_e) {
    /* izleme isteğe bağlı */
  }
}

function startUserPhotosFileWatcher() {
  try {
    fs.watch(userPhotosPath, { persistent: true }, () => {
      clearTimeout(userPhotosWatchTimer);
      userPhotosWatchTimer = setTimeout(broadcastUserPhotosToRenderers, 120);
    });
  } catch (_e) {
    /* izleme isteğe bağlı */
  }
}

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

app.whenReady().then(() => {
  ensureDataFiles();
  registerIpcHandlers();
  startMessagesFileWatcher();
  startUsersFileWatcher();
  startUserPhotosFileWatcher();
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
