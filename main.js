const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
const usersPath = path.join(dataDir, "users.json");
const departmentsPath = path.join(dataDir, "departments.json");
const tasksPath = path.join(dataDir, "tasks.json");
const requestsPath = path.join(dataDir, "requests.json");
const messagesPath = path.join(dataDir, "messages.json");

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
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
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
      writeJsonFile(usersPath, nextUsers);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Kullanıcılar kaydedilemedi." };
    }
  });

  safeHandle("departments:list", () => {
    return parseJsonFile(departmentsPath, []);
  });

  safeHandle("users:add", (_event, newUser) => {
    const users = parseJsonFile(usersPath, []);
    const email = String(newUser?.email || "").trim().toLowerCase();
    const exists = users.some((item) => String(item.email || "").toLowerCase() === email);
    if (exists) {
      return { ok: false, error: "Bu e-posta zaten kayıtlı." };
    }
    users.push(newUser);
    writeJsonFile(usersPath, users);
    return { ok: true };
  });

  safeHandle("auth:register", (_event, payload) => {
    const users = parseJsonFile(usersPath, []);
    const email = String(payload?.email || "").trim().toLowerCase();
    if (!email) {
      return { ok: false, error: "E-posta zorunludur." };
    }
    const exists = users.some((item) => String(item.email || "").toLowerCase() === email);
    if (exists) {
      return { ok: false, error: "Bu e-posta zaten kayıtlı." };
    }
    users.push(payload);
    writeJsonFile(usersPath, users);
    return { ok: true, user: payload };
  });

  safeHandle("users:delete", (_event, userId) => {
    const users = parseJsonFile(usersPath, []);
    const nextUsers = users.filter((item) => item.id !== userId);
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
