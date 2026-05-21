const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  login: (email, password) => ipcRenderer.invoke("auth:login", { email, password }),
  register: (payload) => ipcRenderer.invoke("auth:register", payload),
  listUsers: () => ipcRenderer.invoke("users:list"),
  saveUsers: (users) => ipcRenderer.invoke("users:save", users),
  createUser: (user) => ipcRenderer.invoke("users:create", user),
  listDepartments: () => ipcRenderer.invoke("departments:list"),
  saveDepartments: (departments) => ipcRenderer.invoke("departments:save", departments),
  addUser: (user) => ipcRenderer.invoke("users:add", user),
  deleteUser: (userId) => ipcRenderer.invoke("users:delete", userId),
  listTasks: () => ipcRenderer.invoke("tasks:list"),
  saveTasks: (tasks) => ipcRenderer.invoke("tasks:save", tasks),
  listRequests: () => ipcRenderer.invoke("requests:list"),
  saveRequests: (requests) => ipcRenderer.invoke("requests:save", requests),
  listMessages: () => ipcRenderer.invoke("messages:list"),
  saveMessages: (messages) => ipcRenderer.invoke("messages:save", messages),
  listUserPhotos: () => ipcRenderer.invoke("userPhotos:list"),
  saveUserPhotos: (photos) => ipcRenderer.invoke("userPhotos:save", photos),
  onMessagesUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("messages:updated", handler);
    return () => ipcRenderer.removeListener("messages:updated", handler);
  },
  onUsersUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("users:updated", handler);
    return () => ipcRenderer.removeListener("users:updated", handler);
  },
  onUserPhotosUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("userPhotos:updated", handler);
    return () => ipcRenderer.removeListener("userPhotos:updated", handler);
  }
});
