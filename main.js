const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
const usersPath = path.join(dataDir, "users.json");
const departmentsPath = path.join(dataDir, "departments.json");
const tasksPath = path.join(dataDir, "tasks.json");
const requestsPath = path.join(dataDir, "requests.json");
const messagesPath = path.join(dataDir, "messages.json");

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
      writeJsonFile(usersPath, nextUsers);
      return { ok: true, path: usersPath, count: nextUsers.length };
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
      const nextUser = {
        ...newUser,
        email,
        ad_soyad: String(newUser?.ad_soyad || `${newUser?.ad || ""} ${newUser?.soyad || ""}`.trim() || "-")
      };
      delete nextUser.ad;
      delete nextUser.soyad;
      users.push(nextUser);
      writeJsonFile(usersPath, users);
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

      const nextUser = {
        id: String(payload?.id || Date.now()),
        ad_soyad: String(payload?.ad_soyad || `${payload?.ad || ""} ${payload?.soyad || ""}`.trim() || "-"),
        email,
        sifre: String(payload?.sifre || ""),
        rol: String(payload?.rol || "STAJYER"),
        departman: String(payload?.departman || "Genel"),
        sirketUnvan: String(payload?.sirketUnvan || "Stajyer"),
        telefon: String(payload?.telefon || "***"),
        profilFoto: payload?.profilFoto || null
      };
      delete nextUser.ad;
      delete nextUser.soyad;

      const nextUsers = [...users, nextUser];
      writeJsonFile(usersPath, nextUsers);
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
      const nextUser = {
        ...payload,
        email,
        ad_soyad: String(payload?.ad_soyad || `${payload?.ad || ""} ${payload?.soyad || ""}`.trim() || "-")
      };
      delete nextUser.ad;
      delete nextUser.soyad;
      users.push(nextUser);
      writeJsonFile(usersPath, users);
      return { ok: true, user: nextUser, path: usersPath, count: users.length };
    } catch (error) {
      return { ok: false, error: error?.message || "Kayıt sırasında hata oluştu." };
    }
  });

  safeHandle("users:delete", (_event, userId) => {
    const users = parseJsonFile(usersPath, []);
    const nextUsers = users.filter((item) => String(item?.id ?? "") !== String(userId ?? ""));
    writeJsonFile(usersPath, nextUsers);
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
    return { ok: true };
  });
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
