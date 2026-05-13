const viewRoot = document.getElementById("viewRoot");
const navLinks = [...document.querySelectorAll(".nav-link")];
const sidebar = document.getElementById("sidebar");
const appShell = document.getElementById("appShell");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const logoutBtn = document.getElementById("logoutBtn");
const openTaskCreate = document.getElementById("openTaskCreate");
const taskModal = document.getElementById("taskModal");
const closeTaskModal = document.getElementById("closeTaskModal");
const taskCreateForm = document.getElementById("taskCreateForm");
const taskModalError = document.getElementById("taskModalError");
const taskDetailModal = document.getElementById("taskDetailModal");
const closeTaskDetailModal = document.getElementById("closeTaskDetailModal");
const userCreateModal = document.getElementById("userCreateModal");
const closeUserCreateModal = document.getElementById("closeUserCreateModal");
const cancelUserCreate = document.getElementById("cancelUserCreate");
const userCreateForm = document.getElementById("userCreateForm");
const userCreateError = document.getElementById("userCreateError");
const userEditModal = document.getElementById("userEditModal");
const cancelUserEdit = document.getElementById("cancelUserEdit");
const userEditForm = document.getElementById("userEditForm");
const userDeleteModal = document.getElementById("userDeleteModal");
const cancelUserDelete = document.getElementById("cancelUserDelete");
const confirmUserDelete = document.getElementById("confirmUserDelete");
const userDeleteConfirmCheck = document.getElementById("userDeleteConfirmCheck");
const requestCloseModal = document.getElementById("requestCloseModal");
const cancelRequestClose = document.getElementById("cancelRequestClose");
const confirmRequestClose = document.getElementById("confirmRequestClose");
const requestCloseConfirmCheck = document.getElementById("requestCloseConfirmCheck");
const sidebarUserAvatar = document.getElementById("sidebarUserAvatar");

let currentUser = null;
let requests = [];
let tasks = [];
let messages = [];
let users = [];
/** Profil görselleri users.json dışında (data/user_photos.json). */
let userPhotos = [];
/** Geçerli shell görünümü (gerçek zamanlı mesaj yenilemesi için). */
let activeViewKey = "";
let activeTaskFilter = "Devam Eden";
let activeUsersRoleFilter = "ALL";
let activeUsersPage = 1;
const USERS_PER_PAGE = 8;
const LAST_ACTIVE_VIEW_KEY = "lastActiveView";
let selectedDeleteUserId = "";
let selectedEditUserId = "";
let selectedEditRole = "STAJYER";
let selectedEditStartHour = 9;
let selectedEditEndHour = 18;
let selectedCloseRequestId = "";

const ROLE_ORDER = ["STAJYER", "LEADER", "ADMIN", "MANAGER"];
const ROLE_LABEL_MAP = { MANAGER: "MUDUR", LEADER: "LIDER", ADMIN: "ADMIN", STAJYER: "STAJYER" };
const ROLE_TITLE_MAP = { MANAGER: "Genel Mudur", LEADER: "Takim Lideri", ADMIN: "Admin", STAJYER: "Stajyer" };

function getUserFullName(user) {
  const single = String(user?.ad_soyad || "").trim();
  if (single) return single;
  return `${user?.ad || ""} ${user?.soyad || ""}`.trim() || "-";
}

function getUserInitials(user) {
  return getUserFullName(user)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "--";
}

function normalizeUser(user) {
  const n = { ...user, ad_soyad: getUserFullName(user) };
  delete n.ad;
  delete n.soyad;
  return n;
}

function isSameUser(a, b) {
  return String(a?.id ?? "") === String(b?.id ?? "");
}

async function persistUsersOrThrow(nextUsers) {
  const result = await window.api.saveUsers(nextUsers);
  if (!result?.ok) throw new Error(result?.error || "Kullanicilar kaydedilemedi.");
}

function getRoleLabel(role) {
  const key = String(role || "").toUpperCase();
  return ROLE_LABEL_MAP[key] || key || "STAJYER";
}

function renderSidebarAvatar(user) {
  if (!sidebarUserAvatar) return;
  if (user?.profilFoto) {
    sidebarUserAvatar.innerHTML = `<img src="${user.profilFoto}" alt="Profil" />`;
  } else {
    sidebarUserAvatar.textContent = getUserInitials(user);
  }
}

function findUserBySender(senderId, senderName) {
  if (senderId) {
    const byId = users.find((u) => String(u.id || "") === String(senderId));
    if (byId) return byId;
  }
  const normalizedName = String(senderName || "").trim().toLowerCase();
  if (!normalizedName) return null;
  return users.find((u) => getUserFullName(u).toLowerCase() === normalizedName) || null;
}

function daysLeft(dueDate) {
  if (!dueDate) return null;
  return Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
}

function isBusinessDay(date) {
  const day = new Date(date).getDay();
  return day !== 0 && day !== 6;
}

function businessDaysBetween(startDate) {
  const start = new Date(startDate);
  const today = new Date();
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= today) {
    if (isBusinessDay(cursor)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(count, 0);
}

function normalizeTaskStatusLabel(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "basarisiz" || normalized === "başarısız") return "Başarısız";
  if (normalized === "ara verilen") return "Ara Verilen";
  if (normalized === "iptal edilen") return "İptal Edilen";
  if (normalized === "tamamlanan") return "Tamamlanan";
  return "Devam Eden";
}

function sortRequestsQueuedFirst(list) {
  const queued = [];
  const rest = [];
  for (const item of list) {
    if (item?.status === "Bekletildi") queued.push(item);
    else rest.push(item);
  }
  return [...queued, ...rest];
}

const DEFAULT_CALISMA_SAATI = "09:00 - 18:00";

function replaceMessagesInPlace(next) {
  const arr = Array.isArray(next) ? next : [];
  messages.splice(0, messages.length, ...arr);
}

function replaceUserPhotosInPlace(next) {
  const arr = Array.isArray(next) ? next : [];
  userPhotos.splice(0, userPhotos.length, ...arr);
}

function getUserPhotoById(userId) {
  const id = String(userId ?? "");
  const rec = userPhotos.find((p) => String(p.userId) === id);
  return rec?.avatar ? String(rec.avatar) : "";
}

/** Mesajlar sayfası güncel users/currentUser/avatar ile çizsin (IPC sonrası). */
function syncChatBridgeContext() {
  window.__chatUsers = users;
  window.__chatCurrentUser = currentUser;
  window.__chatGetUserPhotoById = (id) => getUserPhotoById(id);
}

function hydrateCurrentUserFromStores() {
  if (!currentUser?.id) return;
  const ph = getUserPhotoById(currentUser.id);
  if (ph) currentUser.profilFoto = ph;
  currentUser = normalizeUser(currentUser);
  localStorage.setItem("currentUser", JSON.stringify(currentUser));
  renderSidebarAvatar(currentUser);
}

async function persistCurrentUserAvatarToStore() {
  const id = String(currentUser?.id ?? "");
  if (!id) return;
  const avatar = String(currentUser?.profilFoto || "").trim();
  const filtered = userPhotos.filter((p) => String(p.userId) !== id);
  if (avatar) filtered.push({ userId: id, avatar });
  const result = await window.api.saveUserPhotos(filtered);
  if (!result?.ok) throw new Error(result?.error || "Avatar kaydedilemedi.");
  replaceUserPhotosInPlace(filtered);
}

async function loadData() {
  const [u, r, t, m, p] = await Promise.all([
    window.api.listUsers(),
    window.api.listRequests(),
    window.api.listTasks(),
    window.api.listMessages(),
    window.api.listUserPhotos()
  ]);
  users = u;
  requests = r;
  tasks = t;
  replaceMessagesInPlace(m);
  replaceUserPhotosInPlace(p);
  hydrateCurrentUserFromStores();
  const migrationNeeded = users.some((u) => {
    const noAd = !u.ad_soyad || "ad" in u || "soyad" in u;
    const noHours = !u.calismaSaati || !String(u.calismaSaati).trim();
    const hasPhotoOnDisk = "profilFoto" in u && u.profilFoto != null;
    return noAd || noHours || hasPhotoOnDisk;
  });
  if (migrationNeeded) {
    users = users.map((u) => {
      const { profilFoto, ...rest } = u || {};
      return normalizeUser({
        ...rest,
        calismaSaati: rest.calismaSaati && String(rest.calismaSaati).trim() ? rest.calismaSaati : DEFAULT_CALISMA_SAATI
      });
    });
    await persistUsersOrThrow(users);
  }
  if (currentUser?.id && String(currentUser.profilFoto || "").trim() && !getUserPhotoById(currentUser.id)) {
    try {
      await persistCurrentUserAvatarToStore();
      hydrateCurrentUserFromStores();
      syncChatBridgeContext();
    } catch (_e) {
      /* avatar dosyaya yazılamazsa yerel önizleme kalır */
    }
  }
}

function ensureSession() {
  currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");
  if (!currentUser) {
    window.location.href = "./login.html";
    return false;
  }
  currentUser = normalizeUser(currentUser);
  localStorage.setItem("currentUser", JSON.stringify(currentUser));
  document.getElementById("sidebarUserName").textContent = getUserFullName(currentUser);
  document.getElementById("sidebarUserRole").textContent = String(currentUser.sirketUnvan || currentUser.rol || "Kullanici").toUpperCase();
  document.getElementById("sidebarUserDept").textContent = currentUser.departman || "-";
  renderSidebarAvatar(currentUser);
  return true;
}

async function loadView(viewKey) {
  activeViewKey = viewKey;
  window.__messagesPageRefresh = null;
  const html = await fetch(`./pages/${viewKey}.html`).then((r) => r.text());
  viewRoot.innerHTML = html;
  viewRoot.classList.toggle("messages-view", viewKey === "mesajlar");
  viewRoot.classList.toggle("tasks-view", viewKey === "gorevlerim");
  viewRoot.classList.toggle("users-view", viewKey === "kullanicilar");

  if (viewKey === "gelen-talepler") renderRequests();
  if (viewKey === "gorevlerim") renderTasks();
  if (viewKey === "departmanlar") renderDepartments();
  if (viewKey === "kullanicilar") renderUsers();
  if (viewKey === "profil") renderProfile();
  if (viewKey === "mesajlar" && typeof window.initMessagesPage === "function") {
    syncChatBridgeContext();
    window.initMessagesPage({
      messages,
      users,
      currentUser,
      getUserFullName,
      getRoleLabel,
      getUserPhotoById,
      setMessages: replaceMessagesInPlace,
      saveMessages: (next) => window.api.saveMessages(next)
    });
  }
}

async function renderRequests() {
  const list = document.getElementById("requestList");
  if (!list) return;
  if (!requests.length) {
    list.innerHTML = '<div class="requests-v2-empty">Size atanan bir gorev yada talep bulunmuyor</div>';
    return;
  }
  const sortedRequests = sortRequestsQueuedFirst(requests);
  list.innerHTML = sortedRequests
    .map((req) => {
      const owner = findUserBySender(req.senderId, req.sender);
      const senderName = req.sender || getUserFullName(owner);
      const avatar = owner?.profilFoto
        ? `<img src="${owner.profilFoto}" alt="${senderName}" style="width:100%;height:100%;object-fit:cover;border-radius:999px;" />`
        : getUserInitials(owner || { ad_soyad: senderName });
      const queued = req.status === "Bekletildi";
      const remainingDaysRaw = req.dueDate ? daysLeft(req.dueDate) : null;
      const hasFiniteDue = Number.isFinite(remainingDaysRaw);
      const remainingDays = hasFiniteDue ? remainingDaysRaw : null;
      const dueText = hasFiniteDue ? `${remainingDays} Gün Kaldı` : req.dueDate ? `Son Tarih: ${req.dueDate}` : "Son tarih yok";
      const priorityClass =
        req.priority === "Kritik"
          ? "kritik"
          : req.priority === "Önemli" || req.priority === "Onemli"
            ? "onemli"
            : req.priority === "Orta"
              ? "orta"
              : "dusuk";
      const priorityLabel = queued ? "Sıraya Alındı" : req.priority || "Düşük";
      const deadlineClass = remainingDays !== null && remainingDays <= 3 ? "danger" : remainingDays !== null && remainingDays <= 6 ? "warning" : "";
      const metaClass = deadlineClass || (req.dueDate ? (priorityClass === "kritik" ? "danger" : priorityClass === "onemli" ? "warning" : "") : "");
      const requestToneClass =
        deadlineClass === "danger"
          ? "due-danger"
          : deadlineClass === "warning"
            ? "due-warning"
            : `priority-${priorityClass}`;
      return `
      <article class="request-card requests-v2-card ${queued ? "queued" : ""} ${requestToneClass}">
        <div class="requests-v2-top">
          <div class="requests-v2-person">
            <div class="requests-v2-avatar">${avatar}</div>
            <div><h4>${senderName}</h4><p>${req.department || "-"}</p></div>
          </div>
          <div class="requests-v2-top-right">
            <span class="requests-v2-priority ${priorityClass}">${priorityLabel}</span>
            ${queued ? '<span class="requests-v2-queued-check-circle">✓</span>' : ""}
          </div>
        </div>
        <h3 class="requests-v2-task-title" data-action="open" data-id="${req.id}">${req.title || "-"}</h3>
        <p class="requests-v2-desc">${req.description || "-"}</p>
        <div class="requests-v2-meta ${metaClass}">
          <span class="requests-v2-meta-icon">${queued ? "◴" : "◷"}</span>
          <span>${queued ? "İşleme alınmayı bekliyor" : dueText}</span>
        </div>
        <div class="request-actions">
          <button class="btn-primary requests-v2-btn" data-action="accept" data-id="${req.id}">${queued ? "Şimdi Başlat" : "Kabul Et"}</button>
          <button class="btn-ghost requests-v2-btn" data-action="hold" data-id="${req.id}">
            ${queued ? '<span class="requests-v2-btn-icon">✕</span>Talebi Kapat' : '<span class="requests-v2-btn-icon">⊞</span>Sıraya Al'}
          </button>
        </div>
      </article>`;
    })
    .join("");

  list.onclick = async (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    const req = requests.find((r) => r.id === actionEl.dataset.id);
    if (!req) return;
    if (actionEl.dataset.action === "open") {
      req.status = "Acildi";
      await window.api.saveRequests(requests);
      renderRequests();
      return;
    }
    if (actionEl.dataset.action === "accept") {
      const acceptedAt = req.startMode === "assigned" ? req.createdAt || new Date().toISOString() : new Date().toISOString();
      tasks.unshift({ ...req, taskId: `task-${req.id}`, status: "Devam Eden", acceptedAt, postponementStatus: "", postponementReason: "" });
      requests = requests.filter((r) => r.id !== req.id);
      await Promise.all([window.api.saveRequests(requests), window.api.saveTasks(tasks)]);
      renderRequests();
      return;
    }
    if (actionEl.dataset.action === "hold") {
      if (req.status === "Bekletildi") {
        openRequestCloseModal(req);
      } else {
        req.status = "Bekletildi";
        requests = sortRequestsQueuedFirst([req, ...requests.filter((r) => r.id !== req.id)]);
        await window.api.saveRequests(requests);
        renderRequests();
      }
    }
  };
}

function openRequestCloseModal(request) {
  if (!requestCloseModal || !confirmRequestClose || !requestCloseConfirmCheck) return;
  selectedCloseRequestId = String(request.id || "");
  const owner = findUserBySender(request.senderId, request.sender);
  const ownerName = request.sender || getUserFullName(owner) || "-";
  const ownerDept = request.department || owner?.departman || "-";
  const ownerTitle = request.senderTitle || owner?.sirketUnvan || owner?.rol || "-";
  const avatarEl = document.getElementById("requestCloseAvatar");
  const nameEl = document.getElementById("requestCloseName");
  const deptEl = document.getElementById("requestCloseDept");
  const titleEl = document.getElementById("requestCloseTitle");
  const descEl = document.getElementById("requestCloseDescription");
  if (avatarEl) {
    avatarEl.innerHTML = owner?.profilFoto ? `<img src="${owner.profilFoto}" alt="${ownerName}" />` : getUserInitials(owner || { ad_soyad: ownerName });
  }
  if (nameEl) nameEl.textContent = ownerName;
  if (deptEl) deptEl.textContent = ownerDept;
  if (titleEl) titleEl.textContent = ownerTitle;
  if (descEl) descEl.textContent = `${ownerName} adlı kişinin talebini kapatmak istiyor musunuz? Bildirim gider.`;
  requestCloseConfirmCheck.checked = false;
  confirmRequestClose.disabled = true;
  requestCloseModal.classList.remove("hidden");
}

function closeRequestCloseModalFn() {
  if (!requestCloseModal || !confirmRequestClose || !requestCloseConfirmCheck) return;
  requestCloseModal.classList.add("hidden");
  requestCloseConfirmCheck.checked = false;
  confirmRequestClose.disabled = true;
  selectedCloseRequestId = "";
}

async function handleRequestCloseConfirm() {
  if (!selectedCloseRequestId) return;
  requests = requests.filter((r) => String(r.id || "") !== selectedCloseRequestId);
  requests = sortRequestsQueuedFirst(requests);
  await window.api.saveRequests(requests);
  closeRequestCloseModalFn();
  renderRequests();
}

function buildTaskCard(task) {
  const left = daysLeft(task.dueDate);
  const business = businessDaysBetween(task.acceptedAt || new Date().toISOString());
  const statusLabel = normalizeTaskStatusLabel(task.status);
  const priorityClass =
    task.priority === "Kritik"
      ? "kritik"
      : task.priority === "Önemli" || task.priority === "Onemli"
        ? "onemli"
        : task.priority === "Orta"
          ? "orta"
          : "dusuk";
  const deadlineText = left === null ? "Belirli deadline yok" : `${left} Gün Kaldı`;
  const deadlineClass = left !== null && left <= 3 ? "danger" : left !== null && left <= 6 ? "warning" : "";
  const cardToneClass =
    deadlineClass === "danger"
      ? "due-danger"
      : deadlineClass === "warning"
        ? "due-warning"
        : `priority-${priorityClass}`;
  return `
  <article class="task-card tasks-v2-card ${cardToneClass}" data-task-id="${task.taskId}">
    <div class="tasks-v2-card-top">
      <div class="tasks-v2-card-top-left">
        <span class="tasks-v2-priority-pill ${priorityClass}">${task.priority || "Düşük"}</span>
        <h3>${task.title || "-"}</h3>
        <p>${task.description || "-"}</p>
      </div>
      <div class="tasks-v2-state-wrap"><span class="tasks-v2-state">${statusLabel}</span></div>
    </div>
    <div class="tasks-v2-sep"></div>
    <div class="tasks-v2-deadline-row">
      <span class="tasks-v2-deadline ${deadlineClass}">${left !== null ? "⏰ " : ""}${deadlineText}</span>
    </div>
    <div class="tasks-v2-bottom-row">
      <span class="tasks-v2-workday">İş Günü: <strong>${business} Gün</strong></span>
      <button class="btn-ghost tasks-v2-detail-btn" data-action="open-detail" data-id="${task.taskId}">Görev Detayını İncele</button>
    </div>
  </article>`;
}

async function renderTasks() {
  const list = document.getElementById("taskList");
  const count = document.getElementById("taskCount");
  const tabs = document.getElementById("taskTabs");
  if (!list || !count || !tabs) return;
  const filtered = tasks.filter((t) => normalizeTaskStatusLabel(t.status) === activeTaskFilter);
  count.textContent = String(filtered.length);
  list.innerHTML = filtered.map(buildTaskCard).join("") || '<div class="card">Bu filtrede gorev yok.</div>';

  tabs.onclick = (event) => {
    const btn = event.target.closest(".tab-btn");
    if (!btn) return;
    activeTaskFilter = btn.dataset.status;
    tabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderTasks();
  };

  list.onclick = async (event) => {
    const actionBtn = event.target.closest("[data-action]");
    if (actionBtn) {
      const task = tasks.find((t) => t.taskId === actionBtn.dataset.id);
      if (!task) return;
      const action = actionBtn.dataset.action;
      if (action === "open-detail") {
        openTaskDetailModal(task);
        return;
      }
      if (action === "pause") task.status = "Ara Verilen";
      if (action === "complete") task.status = "Tamamlanan";
      if (action === "fail") task.status = "Başarısız";
      if (action === "postpone") task.postponementReason = window.prompt("Erteleme sebebi:") || "";
      await window.api.saveTasks(tasks);
      renderTasks();
      return;
    }
    const card = event.target.closest(".tasks-v2-card");
    if (!card) return;
    const task = tasks.find((t) => t.taskId === card.dataset.taskId);
    if (task) openTaskDetailModal(task);
  };
}

function openTaskWorkspace(task) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`
    <!doctype html><html><head><meta charset="utf-8"><title>Gorev</title>
    <style>body{font-family:Arial;background:#0f1320;color:#e8ecff;margin:0;padding:24px}
    .box{max-width:980px;margin:0 auto;border:1px solid #2d3450;border-radius:12px;background:#151b2b;padding:18px}
    h1{margin:0 0 8px}p{line-height:1.6}.meta{color:#98a4cb;font-size:14px;margin-top:10px}</style></head>
    <body><div class="box"><h1>${task.title || "-"}</h1><p>${task.description || "-"}</p><div class="meta">Oncelik: ${task.priority || "-"} | Son Tarih: ${task.dueDate || "Yok"}</div></div></body></html>
  `);
  w.document.close();
}

function openTaskDetailModal(task) {
  if (!taskDetailModal) return;
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  const owner = findUserBySender(task.senderId, task.sender);
  const ownerName = task.sender || getUserFullName(owner) || "-";
  const avatarEl = document.getElementById("taskDetailManagerAvatar");
  if (avatarEl) {
    avatarEl.innerHTML = owner?.profilFoto
      ? `<img src="${owner.profilFoto}" alt="${ownerName}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" />`
      : getUserInitials(owner || { ad_soyad: ownerName });
  }
  const left = daysLeft(task.dueDate);
  setText("taskDetailDueTag", left === null ? "• Son Teslim Tarihi: Belirtilmedi" : `• ${left} gün kaldı`);
  setText("taskDetailPriorityTag", `! Öncelik: ${task.priority || "-"}`);
  setText("taskDetailTitle", task.title || "-");
  setText("taskDetailDescription", task.description || "-");
  setText("taskDetailManagerName", ownerName);
  setText("taskDetailManagerRole", task.senderTitle || owner?.sirketUnvan || owner?.rol || "-");
  setText("taskDetailManagerDept", task.department || owner?.departman || "-");

  const dueTagEl = document.getElementById("taskDetailDueTag");
  const priorityTagEl = document.getElementById("taskDetailPriorityTag");
  if (dueTagEl) {
    dueTagEl.classList.remove("task-detail-tag-warning", "task-detail-tag-danger", "task-detail-tag-mid");
    if (left !== null && left <= 3) dueTagEl.classList.add("task-detail-tag-danger");
    else if (left !== null && left <= 6) dueTagEl.classList.add("task-detail-tag-warning");
  }
  if (priorityTagEl) {
    priorityTagEl.classList.remove("task-detail-tag-warning", "task-detail-tag-danger", "task-detail-tag-mid");
    const p = String(task.priority || "").toLowerCase();
    if (p === "kritik") priorityTagEl.classList.add("task-detail-tag-danger");
    else if (p === "önemli" || p === "onemli") priorityTagEl.classList.add("task-detail-tag-warning");
    else if (p === "orta") priorityTagEl.classList.add("task-detail-tag-mid");
  }

  const actions = taskDetailModal.querySelector(".task-detail-actions");
  if (actions) {
    const postpone = actions.querySelector(".task-detail-btn-ghost");
    const startBtn = actions.querySelector(".task-detail-btn-primary");
    if (postpone) postpone.style.display = task.dueDate ? "" : "none";
    if (startBtn) {
      startBtn.innerHTML = 'Göreve Başla <span>▷</span>';
      startBtn.onclick = () => openTaskWorkspace(task);
    }
  }
  taskDetailModal.classList.remove("hidden");
  document.body.classList.add("task-detail-open");
}

function closeTaskDetailModalFn() {
  if (!taskDetailModal) return;
  taskDetailModal.classList.add("hidden");
  document.body.classList.remove("task-detail-open");
}

function renderDepartments() {
  const rows = document.getElementById("departmentRows");
  const stats = document.getElementById("departmentStats");
  if (!rows || !stats) return;
  const byDep = users.reduce((acc, u) => {
    const key = u.departman || "Genel";
    if (!acc[key]) acc[key] = [];
    acc[key].push(u);
    return acc;
  }, {});
  const deps = Object.entries(byDep);
  stats.innerHTML = `
    <div class="departments-v2-stat-box"><strong>${deps.length}</strong><span>Aktif Departman</span></div>
    <div class="departments-v2-stat-box"><strong>${users.length}</strong><span>Toplam Uye</span></div>
  `;
  rows.innerHTML = deps.map(([name, members]) => `<section class="departments-v2-row expanded"><div class="departments-v2-row-head"><div class="departments-v2-row-title-wrap"><div><h3>${name}</h3><p>${members.length} kisilik ekip</p></div></div></div></section>`).join("");
}

function renderUsers() {
  const tbody = document.getElementById("usersTableBody");
  const tabs = document.getElementById("usersRoleTabs");
  const addBtn = document.querySelector(".users-v2-add-btn");
  const totalEl = document.getElementById("usersTotalCount");
  const rangeEl = document.getElementById("usersRangeInfo");
  const paginationEl = document.getElementById("usersPagination");
  if (!tbody || !tabs || !totalEl || !rangeEl || !paginationEl) return;

  const roleClassMap = { MANAGER: "mudur", LEADER: "lider", ADMIN: "admin", STAJYER: "stajyer" };
  const filteredUsers = activeUsersRoleFilter === "ALL" ? users : users.filter((u) => String(u.rol || "").toUpperCase() === activeUsersRoleFilter);
  const total = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(total / USERS_PER_PAGE));
  if (activeUsersPage > totalPages) activeUsersPage = totalPages;
  const start = (activeUsersPage - 1) * USERS_PER_PAGE;
  const shown = filteredUsers.slice(start, start + USERS_PER_PAGE);
  totalEl.textContent = String(total);
  tbody.innerHTML =
    shown
      .map((user) => {
        const full = getUserFullName(user);
        const initials = getUserInitials(user);
        const role = String(user.rol || "STAJYER").toUpperCase();
        return `
        <tr>
          <td><div class="users-v2-person"><div class="users-v2-avatar">${user?.profilFoto ? `<img src="${user.profilFoto}" alt="${full}" />` : initials}</div><div><strong>${full}</strong><small>Kullanici ID: #${user.id || "-"}</small></div></div></td>
          <td>${user.email || "-"}</td>
          <td>${user.departman || "-"}</td>
          <td><span class="users-v2-role ${roleClassMap[role] || "stajyer"}">${getRoleLabel(role)}</span></td>
          <td><div class="users-v2-actions"><button class="users-v2-icon-btn" data-action="mail" data-user-id="${user.id}">✉</button><button class="users-v2-icon-btn" data-action="edit" data-user-id="${user.id}">✎</button><button class="users-v2-icon-btn delete" data-action="delete" data-user-id="${user.id}">🗑</button></div></td>
        </tr>`;
      })
      .join("") || '<tr><td colspan="5" class="users-v2-empty">Kullanici bulunamadi.</td></tr>';

  const shownStart = total === 0 ? 0 : start + 1;
  const shownEnd = Math.min(start + USERS_PER_PAGE, total);
  rangeEl.textContent = `${total} kullanicidan ${shownStart}-${shownEnd} arasi gosteriliyor`;
  paginationEl.innerHTML = `
    <button class="users-v2-page-btn nav" data-page="${Math.max(1, activeUsersPage - 1)}">‹</button>
    ${Array.from({ length: totalPages }, (_, i) => `<button class="users-v2-page-btn ${i + 1 === activeUsersPage ? "active" : ""}" data-page="${i + 1}">${i + 1}</button>`).join("")}
    <button class="users-v2-page-btn nav" data-page="${Math.min(totalPages, activeUsersPage + 1)}">›</button>
  `;

  tabs.onclick = (event) => {
    const btn = event.target.closest("[data-role]");
    if (!btn) return;
    activeUsersRoleFilter = btn.dataset.role;
    activeUsersPage = 1;
    tabs.querySelectorAll(".tab-btn").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    renderUsers();
  };

  paginationEl.onclick = (event) => {
    const btn = event.target.closest("[data-page]");
    if (!btn) return;
    activeUsersPage = Number(btn.dataset.page);
    renderUsers();
  };

  tbody.onclick = (event) => {
    const actionBtn = event.target.closest("[data-action][data-user-id]");
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    const userId = String(actionBtn.dataset.userId || "");
    const user = users.find((u) => String(u.id || "") === userId);
    if (!user) return;
    if (action === "delete") openUserDeleteModal(user);
    if (action === "edit") openUserEditModal(user);
    if (action === "mail") window.alert(`${getUserFullName(user)} icin mesaj akisi yakinda.`);
  };

  if (addBtn) addBtn.onclick = () => openUserCreateModal();
}

function openUserCreateModal() {
  if (!userCreateModal) return;
  userCreateModal.classList.remove("hidden");
  if (userCreateError) userCreateError.textContent = "";
}

function closeUserCreateModalFn() {
  if (!userCreateModal) return;
  userCreateModal.classList.add("hidden");
  if (userCreateForm) userCreateForm.reset();
  if (userCreateError) userCreateError.textContent = "";
}

function refreshUserEditWorkHoursLabel() {
  const start = document.getElementById("userEditStartHourLabel");
  const end = document.getElementById("userEditEndHourLabel");
  if (start) start.textContent = `${String(selectedEditStartHour).padStart(2, "0")}:00`;
  if (end) end.textContent = `${String(selectedEditEndHour).padStart(2, "0")}:00`;
}

function shiftHour(value, step) {
  return (value + step + 24) % 24;
}

function changeUserEditWorkHours(part, step) {
  if (part === "start") selectedEditStartHour = shiftHour(selectedEditStartHour, step);
  if (part === "end") selectedEditEndHour = shiftHour(selectedEditEndHour, step);
  refreshUserEditWorkHoursLabel();
}

function openUserEditModal(user) {
  if (!userEditModal || !userEditForm) return;
  selectedEditUserId = String(user.id || "");
  selectedEditRole = String(user.rol || "STAJYER").toUpperCase();
  if (!ROLE_ORDER.includes(selectedEditRole)) selectedEditRole = "STAJYER";
  const nameTopEl = document.getElementById("userEditNameTop");
  const descEl = document.getElementById("userEditDescription");
  const deptSelect = document.getElementById("userEditDepartment");
  const roleSelect = document.getElementById("userEditRole");
  const avatarEl = document.getElementById("userEditAvatar");
  const editError = document.getElementById("userEditError");
  const match = String(user.calismaSaati || "09:00 - 18:00").match(/(\d{1,2}):\d{2}\s*-\s*(\d{1,2}):\d{2}/);
  selectedEditStartHour = match ? Number(match[1]) : 9;
  selectedEditEndHour = match ? Number(match[2]) : 18;
  const fullName = getUserFullName(user);
  if (nameTopEl) nameTopEl.textContent = fullName;
  if (descEl) {
    descEl.textContent = `${fullName} için departman, rol ve çalışma saatini güncelleyebilirsiniz.`;
  }
  if (deptSelect) {
    const dept = String(user.departman || "").trim();
    let hasOption = [...deptSelect.options].some((o) => o.value === dept);
    if (dept && !hasOption) {
      const opt = document.createElement("option");
      opt.value = dept;
      opt.textContent = dept;
      deptSelect.insertBefore(opt, deptSelect.firstChild);
      hasOption = true;
    }
    deptSelect.value = dept || deptSelect.options[0]?.value || "";
  }
  if (roleSelect) {
    roleSelect.value = ROLE_ORDER.includes(selectedEditRole) ? selectedEditRole : "STAJYER";
  }
  if (avatarEl) avatarEl.innerHTML = user?.profilFoto ? `<img src="${user.profilFoto}" alt="${fullName}" />` : getUserInitials(user);
  if (editError) editError.textContent = "";
  refreshUserEditWorkHoursLabel();
  userEditModal.classList.remove("hidden");
}

function closeUserEditModalFn() {
  if (!userEditModal || !userEditForm) return;
  userEditModal.classList.add("hidden");
  userEditForm.reset();
  const editError = document.getElementById("userEditError");
  if (editError) editError.textContent = "";
  selectedEditUserId = "";
  selectedEditRole = "STAJYER";
  selectedEditStartHour = 9;
  selectedEditEndHour = 18;
}

async function handleUserEditSubmit(event) {
  event.preventDefault();
  const editError = document.getElementById("userEditError");
  if (editError) editError.textContent = "";
  const deptSelect = document.getElementById("userEditDepartment");
  const roleSelect = document.getElementById("userEditRole");
  const nextDept = String(deptSelect?.value || "").trim();
  const nextRole = String(roleSelect?.value || "STAJYER").toUpperCase();
  if (!nextDept) return editError && (editError.textContent = "Departman seçilmelidir.");
  if (selectedEditStartHour === selectedEditEndHour) return editError && (editError.textContent = "Baslangic ve bitis saati ayni olamaz.");
  const existing = users.find((u) => String(u.id || "") === selectedEditUserId);
  if (!existing) return;
  const nextName = getUserFullName(existing);
  const updated = normalizeUser({
    ...existing,
    ad_soyad: nextName,
    departman: nextDept,
    calismaSaati: `${String(selectedEditStartHour).padStart(2, "0")}:00 - ${String(selectedEditEndHour).padStart(2, "0")}:00`,
    rol: nextRole,
    sirketUnvan: ROLE_TITLE_MAP[nextRole] || nextRole
  });
  users = users.map((u) => (String(u.id || "") === selectedEditUserId ? updated : normalizeUser(u)));
  try {
    await persistUsersOrThrow(users);
  } catch (e) {
    return editError && (editError.textContent = e?.message || "Kullanici guncellenemedi.");
  }
  if (isSameUser(currentUser, updated)) {
    currentUser = normalizeUser(updated);
    localStorage.setItem("currentUser", JSON.stringify(currentUser));
    document.getElementById("sidebarUserName").textContent = getUserFullName(currentUser);
    document.getElementById("sidebarUserRole").textContent = String(currentUser.sirketUnvan || currentUser.rol || "Kullanici").toUpperCase();
    document.getElementById("sidebarUserDept").textContent = currentUser.departman || "-";
    renderSidebarAvatar(currentUser);
  }
  closeUserEditModalFn();
  renderUsers();
}

function openUserDeleteModal(user) {
  if (!userDeleteModal || !confirmUserDelete || !userDeleteConfirmCheck) return;
  selectedDeleteUserId = String(user.id || "");
  const name = getUserFullName(user);
  const avatarEl = document.getElementById("userDeleteAvatar");
  const nameTopEl = document.getElementById("userDeleteNameTop");
  const descEl = document.getElementById("userDeleteDescription");
  if (avatarEl) avatarEl.innerHTML = user?.profilFoto ? `<img src="${user.profilFoto}" alt="${name}" />` : getUserInitials(user);
  if (nameTopEl) nameTopEl.textContent = name;
  if (descEl) descEl.textContent = `${name} adli kullanicinin hesabini kaldirmak istiyor musunuz? Geri donus yapilamaz.`;
  userDeleteConfirmCheck.checked = false;
  confirmUserDelete.disabled = true;
  userDeleteModal.classList.remove("hidden");
}

function closeUserDeleteModalFn() {
  if (!userDeleteModal || !confirmUserDelete || !userDeleteConfirmCheck) return;
  userDeleteModal.classList.add("hidden");
  userDeleteConfirmCheck.checked = false;
  confirmUserDelete.disabled = true;
  selectedDeleteUserId = "";
}

async function handleDeleteUserConfirm() {
  if (!selectedDeleteUserId) return;
  const result = await window.api.deleteUser(selectedDeleteUserId);
  if (!result?.ok) return window.alert(result?.error || "Kullanici silinemedi.");
  users = users.filter((u) => String(u.id || "") !== selectedDeleteUserId);
  const deletedCurrent = String(currentUser?.id || "") === selectedDeleteUserId;
  closeUserDeleteModalFn();
  if (deletedCurrent) {
    localStorage.removeItem("currentUser");
    window.location.href = "./login.html";
    return;
  }
  renderUsers();
}

async function handleCreateUser(event) {
  event.preventDefault();
  if (!userCreateError) return;
  userCreateError.textContent = "";
  const fullName = document.getElementById("newUserFullName")?.value.trim() || "";
  const email = document.getElementById("newUserEmail")?.value.trim() || "";
  const password = document.getElementById("newUserPassword")?.value || "";
  const passwordAgain = document.getElementById("newUserPasswordAgain")?.value || "";
  const department = document.getElementById("newUserDepartment")?.value || "";
  const role = document.getElementById("newUserRole")?.value || "";
  if (!fullName || !email || !password || !passwordAgain || !department || !role) {
    userCreateError.textContent = "Lutfen tum alanlari doldurun.";
    return;
  }
  if (password !== passwordAgain) {
    userCreateError.textContent = "Sifreler eslesmiyor.";
    return;
  }
  const normalizedEmail = email.toLowerCase();
  const emailExists = users.some((u) => String(u?.email || "").toLowerCase() === normalizedEmail);
  if (emailExists) {
    userCreateError.textContent = "Bu e-posta zaten kayıtlı.";
    return;
  }
  const newUser = {
    id: String(Date.now()),
    ad_soyad: fullName,
    email: normalizedEmail,
    sifre: password,
    rol: role,
    departman: department,
    sirketUnvan: ROLE_TITLE_MAP[role] || role,
    telefon: "***"
  };
  try {
    const latestUsers = await window.api.listUsers();
    const duplicateInFile = latestUsers.some((u) => String(u?.email || "").toLowerCase() === normalizedEmail);
    if (duplicateInFile) {
      userCreateError.textContent = "Bu e-posta zaten kayıtlı.";
      return;
    }
    const saveResult = await window.api.saveUsers([...latestUsers, newUser]);
    if (!saveResult?.ok) {
      userCreateError.textContent = saveResult?.error || "Kullanıcı kaydedilemedi.";
      return;
    }
  } catch (error) {
    userCreateError.textContent = error?.message || "Kullanıcı kaydı sırasında bağlantı hatası oluştu.";
    return;
  }

  users = (await window.api.listUsers()).map(normalizeUser);
  const persisted = users.some((u) => String(u?.email || "").toLowerCase() === normalizedEmail);
  if (!persisted) {
    userCreateError.textContent = "Kullanıcı kaydı doğrulanamadı.";
    return;
  }
  activeUsersRoleFilter = "ALL";
  activeUsersPage = 1;
  closeUserCreateModalFn();
  renderUsers();
}

function renderProfile() {
  if (!currentUser) return;
  const profileAvatarEl = document.getElementById("profileAvatar");
  const photoInputEl = document.getElementById("profilePhotoInput");
  const photoCameraBtn = document.getElementById("profilePhotoCameraBtn");
  const photoErrorEl = document.getElementById("profilePhotoError");
  const fullNameEl = document.getElementById("profileFullName");
  const fullNameInput = document.getElementById("profileFullNameInput");
  const nameEditBtn = document.getElementById("profileNameEditBtn");
  const nameError = document.getElementById("profileNameError");
  const emailEl = document.getElementById("profileInfoEmail");
  const emailInput = document.getElementById("profileInfoEmailInput");
  const emailEditBtn = document.getElementById("profileEmailEditBtn");
  const emailError = document.getElementById("profileEmailError");
  const phoneEl = document.getElementById("profilePhone");
  const phoneInput = document.getElementById("profilePhoneInput");
  const phoneEditBtn = document.getElementById("profilePhoneEditBtn");
  const aboutEl = document.getElementById("profileAboutText");
  const aboutInput = document.getElementById("profileAboutInput");
  const aboutEditBtn = document.getElementById("profileAboutEditBtn");
  const imageModal = document.getElementById("profileImageModal");
  const imageModalImg = document.getElementById("profileImageModalImg");
  const cropModal = document.getElementById("profileCropModal");
  const cropStage = document.getElementById("profileCropStage");
  const cropImage = document.getElementById("profileCropImage");
  const cancelCropBtn = document.getElementById("cancelProfileCrop");
  const applyCropBtn = document.getElementById("applyProfileCrop");
  const aboutKey = `profileAbout:${String(currentUser.id || "")}`;
  const savedAbout = String(localStorage.getItem(aboutKey) || "").trim();
  const fallbackAbout =
    "Yazilim gelistirme sureclerine merakli, ogrenmeye acik ve ekip calismasina yatkin bir stajyerim. Modern web teknolojileri ve surdurulebilir kod mimarileri uzerine kendimi gelistirmeyi hedefliyorum.";
  const map = {
    profileFullName: getUserFullName(currentUser),
    profileTitle: currentUser.sirketUnvan || currentUser.rol || "-",
    profileDepartmentBadge: currentUser.departman || "-",
    profileInfoEmail: currentUser.email || "-",
    profilePhone: currentUser.telefon || "***",
    profileAboutText: savedAbout || fallbackAbout,
    profileWorkHours: currentUser.calismaSaati || "09:00 - 18:00"
  };
  Object.entries(map).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
  const renderAvatar = () => {
    if (!profileAvatarEl) return;
    if (currentUser?.profilFoto) {
      profileAvatarEl.classList.add("has-photo");
      profileAvatarEl.innerHTML = `<img src="${currentUser.profilFoto}" alt="Profil" class="profile-v2-photo-img" />`;
    } else {
      profileAvatarEl.classList.remove("has-photo");
      profileAvatarEl.textContent = getUserInitials(currentUser);
    }
  };
  renderAvatar();

  let nameEdit = false;
  let emailEdit = false;
  let phoneEdit = false;
  let aboutEdit = false;
  const setNameError = (msg) => nameError && (nameError.textContent = msg || "");
  const setEmailError = (msg) => emailError && (emailError.textContent = msg || "");

  const syncUserSave = async () => {
    const { profilFoto: _dropPhoto, ...cuForDisk } = currentUser;
    users = users.map((u) => (isSameUser(u, currentUser) ? normalizeUser({ ...u, ...cuForDisk }) : normalizeUser(u)));
    await persistUsersOrThrow(users);
    users = (await window.api.listUsers()).map(normalizeUser);
    const latest = users.find((u) => isSameUser(u, currentUser));
    if (latest) {
      currentUser = normalizeUser(latest);
      hydrateCurrentUserFromStores();
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
    }
  };

  let cropState = {
    source: "",
    scale: 1,
    x: 0,
    y: 0,
    dragging: false,
    startX: 0,
    startY: 0
  };

  const applyCropTransform = () => {
    if (!cropImage) return;
    cropImage.style.transform = `translate(calc(-50% + ${cropState.x}px), calc(-50% + ${cropState.y}px)) scale(${cropState.scale})`;
  };

  const openCropModal = (src) => {
    if (!cropModal || !cropImage) return;
    cropState = { source: src, scale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0 };
    cropImage.src = src;
    cropImage.onload = () => applyCropTransform();
    cropModal.classList.remove("hidden");
  };

  const closeCropModal = () => {
    if (!cropModal) return;
    cropModal.classList.add("hidden");
  };

  const setNameMode = (active) => {
    if (!fullNameEl || !fullNameInput || !nameEditBtn) return;
    nameEdit = active;
    if (active) {
      fullNameInput.value = getUserFullName(currentUser);
      fullNameEl.classList.add("hidden");
      fullNameInput.classList.remove("hidden");
      nameEditBtn.textContent = "✓";
      fullNameInput.focus();
      fullNameInput.select();
    } else {
      fullNameEl.classList.remove("hidden");
      fullNameInput.classList.add("hidden");
      nameEditBtn.textContent = "✎";
    }
  };
  const setEmailMode = (active) => {
    if (!emailEl || !emailInput || !emailEditBtn) return;
    emailEdit = active;
    if (active) {
      emailInput.value = String(currentUser.email || "");
      emailEl.classList.add("hidden");
      emailInput.classList.remove("hidden");
      emailEditBtn.textContent = "✓";
      emailInput.focus();
      emailInput.select();
    } else {
      emailEl.classList.remove("hidden");
      emailInput.classList.add("hidden");
      emailEditBtn.textContent = "✎";
    }
  };
  const setPhoneMode = (active) => {
    if (!phoneEl || !phoneInput || !phoneEditBtn) return;
    phoneEdit = active;
    if (active) {
      phoneInput.value = String(currentUser.telefon || "").replace(/\D/g, "");
      phoneEl.classList.add("hidden");
      phoneInput.classList.remove("hidden");
      phoneEditBtn.textContent = "✓";
      phoneInput.focus();
      phoneInput.select();
    } else {
      phoneEl.classList.remove("hidden");
      phoneInput.classList.add("hidden");
      phoneEditBtn.textContent = "✎";
    }
  };
  const setAboutMode = (active) => {
    if (!aboutEl || !aboutInput || !aboutEditBtn) return;
    aboutEdit = active;
    if (active) {
      aboutInput.value = savedAbout || "";
      aboutEl.classList.add("hidden");
      aboutInput.classList.remove("hidden");
      aboutEditBtn.textContent = "✓";
      aboutInput.focus();
    } else {
      aboutEl.classList.remove("hidden");
      aboutInput.classList.add("hidden");
      aboutEditBtn.textContent = "✎";
    }
  };

  const saveName = async () => {
    const value = String(fullNameInput?.value || "").trim().replace(/\s+/g, " ");
    if (!value) return setNameError("Ad soyad zorunludur.");
    currentUser.ad_soyad = value;
    delete currentUser.ad;
    delete currentUser.soyad;
    localStorage.setItem("currentUser", JSON.stringify(currentUser));
    if (fullNameEl) fullNameEl.textContent = value;
    document.getElementById("sidebarUserName").textContent = value;
    renderSidebarAvatar(currentUser);
    renderAvatar();
    setNameError("");
    setNameMode(false);
    try {
      await syncUserSave();
    } catch (error) {
      setNameError(error?.message || "Ad soyad kaydedilemedi.");
    }
  };

  const saveEmail = async () => {
    const value = String(emailInput?.value || "").trim().toLowerCase();
    if (!value) return setEmailError("E-posta zorunludur.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setEmailError("Gecerli e-posta giriniz.");
    const duplicate = users.some((u) => !isSameUser(u, currentUser) && String(u.email || "").toLowerCase() === value);
    if (duplicate) return setEmailError("Bu e-posta zaten kullanimda.");
    currentUser.email = value;
    localStorage.setItem("currentUser", JSON.stringify(currentUser));
    if (emailEl) emailEl.textContent = value;
    setEmailError("");
    setEmailMode(false);
    try {
      await syncUserSave();
    } catch (error) {
      setEmailError(error?.message || "E-posta kaydedilemedi.");
    }
  };

  const savePhone = async () => {
    const value = String(phoneInput?.value || "").replace(/\D/g, "");
    if (!value) return;
    currentUser.telefon = value;
    localStorage.setItem("currentUser", JSON.stringify(currentUser));
    if (phoneEl) phoneEl.textContent = value;
    setPhoneMode(false);
    try {
      await syncUserSave();
    } catch (error) {
      if (photoErrorEl) photoErrorEl.textContent = error?.message || "Telefon kaydedilemedi.";
    }
  };

  const saveAbout = () => {
    const value = String(aboutInput?.value || "").trim() || fallbackAbout;
    localStorage.setItem(aboutKey, value);
    if (aboutEl) aboutEl.textContent = value;
    setAboutMode(false);
  };

  if (nameEditBtn) nameEditBtn.onclick = async () => (nameEdit ? saveName() : setNameMode(true));
  if (fullNameInput) fullNameInput.onkeydown = async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await saveName();
    }
    if (e.key === "Escape") setNameMode(false);
  };
  if (emailEditBtn) emailEditBtn.onclick = async () => (emailEdit ? saveEmail() : setEmailMode(true));
  if (emailInput) {
    emailInput.oninput = () => setEmailError("");
    emailInput.onkeydown = async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await saveEmail();
      }
      if (e.key === "Escape") setEmailMode(false);
    };
  }
  if (phoneEditBtn) phoneEditBtn.onclick = async () => (phoneEdit ? savePhone() : setPhoneMode(true));
  if (phoneInput) {
    phoneInput.oninput = () => (phoneInput.value = phoneInput.value.replace(/\D/g, ""));
    phoneInput.onkeydown = async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await savePhone();
      }
      if (e.key === "Escape") setPhoneMode(false);
    };
  }
  if (aboutEditBtn) aboutEditBtn.onclick = async () => (aboutEdit ? saveAbout() : setAboutMode(true));
  if (aboutInput) {
    aboutInput.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        saveAbout();
      }
      if (e.key === "Escape") setAboutMode(false);
    };
  }

  if (photoCameraBtn && photoInputEl) photoCameraBtn.onclick = () => photoInputEl.click();
  if (photoInputEl) {
    photoInputEl.onchange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        if (photoErrorEl) photoErrorEl.textContent = "Lutfen sadece resim dosyasi secin.";
        photoInputEl.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const imageSrc = String(reader.result || "");
        openCropModal(imageSrc);
      };
      reader.readAsDataURL(file);
      photoInputEl.value = "";
    };
  }

  if (cropStage && cropImage) {
    cropStage.onwheel = (event) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.08 : 0.08;
      cropState.scale = Math.min(4, Math.max(0.25, cropState.scale + delta));
      applyCropTransform();
    };

    cropStage.onmousedown = (event) => {
      cropState.dragging = true;
      cropState.startX = event.clientX;
      cropState.startY = event.clientY;
    };

    cropStage.onmousemove = (event) => {
      if (!cropState.dragging) return;
      const dx = event.clientX - cropState.startX;
      const dy = event.clientY - cropState.startY;
      cropState.startX = event.clientX;
      cropState.startY = event.clientY;
      cropState.x += dx;
      cropState.y += dy;
      applyCropTransform();
    };

    cropStage.onmouseup = () => {
      cropState.dragging = false;
    };

    cropStage.onmouseleave = () => {
      cropState.dragging = false;
    };
  }

  if (cancelCropBtn) cancelCropBtn.onclick = () => closeCropModal();
  if (applyCropBtn) {
    applyCropBtn.onclick = async () => {
      if (!cropImage || !cropImage.naturalWidth || !cropStage) return;
      const stageRect = cropStage.getBoundingClientRect();
      const canvasSize = 512;
      const canvas = document.createElement("canvas");
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const scaledW = cropImage.naturalWidth * cropState.scale;
      const scaledH = cropImage.naturalHeight * cropState.scale;
      const drawX = (canvasSize - scaledW) / 2 + (cropState.x * canvasSize) / Math.max(stageRect.width, 1);
      const drawY = (canvasSize - scaledH) / 2 + (cropState.y * canvasSize) / Math.max(stageRect.height, 1);
      ctx.save();
      ctx.beginPath();
      ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(cropImage, drawX, drawY, scaledW, scaledH);
      ctx.restore();
      currentUser.profilFoto = canvas.toDataURL("image/png");
      localStorage.setItem("currentUser", JSON.stringify(currentUser));
      try {
        await persistCurrentUserAvatarToStore();
        syncChatBridgeContext();
        await syncUserSave();
        renderAvatar();
        renderSidebarAvatar(currentUser);
        if (photoErrorEl) photoErrorEl.textContent = "";
        closeCropModal();
      } catch (error) {
        if (photoErrorEl) photoErrorEl.textContent = error?.message || "Profil fotoğrafı kaydedilemedi.";
      }
    };
  }
  if (profileAvatarEl) {
    profileAvatarEl.onclick = () => {
      if (!currentUser?.profilFoto || !imageModal || !imageModalImg) return;
      imageModalImg.src = currentUser.profilFoto;
      imageModal.classList.toggle("hidden");
    };
  }
  if (imageModal) imageModal.onclick = () => imageModal.classList.add("hidden");
}

async function handleCreateTask(event) {
  event.preventDefault();
  taskModalError.textContent = "";
  const usersField = document.getElementById("taskUsers")?.value.trim() || "";
  const title = document.getElementById("taskTitle")?.value.trim() || "";
  const description = document.getElementById("taskDescription")?.value.trim() || "";
  const priority = document.getElementById("taskPriority")?.value || "Dusuk";
  const startMode = document.getElementById("taskStartMode")?.value || "accepted";
  const dueDate = document.getElementById("taskDueDate")?.value || "";
  const attachment = document.getElementById("taskAttachment")?.value?.trim() || "";
  if (!usersField || !title || !description) {
    taskModalError.textContent = "Stajyer, baslik ve aciklama zorunludur.";
    return;
  }
  const request = {
    id: String(Date.now()),
    title,
    description,
    sender: getUserFullName(currentUser),
    senderId: currentUser.id,
    department: currentUser.departman || "-",
    priority,
    dueDate: dueDate || "",
    startMode,
    attachment,
    assignees: usersField,
    status: "Yanit Bekliyor",
    createdAt: new Date().toISOString()
  };
  requests.unshift(request);
  requests = sortRequestsQueuedFirst(requests);
  await window.api.saveRequests(requests);
  closeTaskModalFn();
  const currentUrl = window.location.href;
  window.location.reload();
  setTimeout(() => {
    if (window.location.href === currentUrl) {
      window.location.href = currentUrl;
    }
  }, 120);
}

function openTaskModal() {
  if (taskModal) taskModal.classList.remove("hidden");
}

function closeTaskModalFn() {
  if (!taskModal) return;
  taskModal.classList.add("hidden");
  if (taskCreateForm) taskCreateForm.reset();
  if (taskModalError) taskModalError.textContent = "";
}

function bindShellEvents() {
  navLinks.forEach((btn) => {
    btn.addEventListener("click", async () => {
      navLinks.forEach((item) => item.classList.remove("active"));
      btn.classList.add("active");
      if (btn.dataset.view === "gorev-olustur") return openTaskModal();
      localStorage.setItem(LAST_ACTIVE_VIEW_KEY, btn.dataset.view);
      await loadView(btn.dataset.view);
    });
  });

  if (toggleSidebarBtn) toggleSidebarBtn.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    appShell.classList.toggle("collapsed");
  });

  if (logoutBtn) logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("currentUser");
    window.location.href = "./login.html";
  });

  if (openTaskCreate) openTaskCreate.addEventListener("click", openTaskModal);
  if (closeTaskModal) closeTaskModal.addEventListener("click", closeTaskModalFn);
  if (taskModal) taskModal.addEventListener("click", (e) => e.target === taskModal && closeTaskModalFn());
  if (taskCreateForm) taskCreateForm.addEventListener("submit", handleCreateTask);

  if (closeTaskDetailModal) closeTaskDetailModal.addEventListener("click", closeTaskDetailModalFn);
  if (taskDetailModal) taskDetailModal.addEventListener("click", (e) => e.target === taskDetailModal && closeTaskDetailModalFn());

  if (closeUserCreateModal) closeUserCreateModal.addEventListener("click", closeUserCreateModalFn);
  if (cancelUserCreate) cancelUserCreate.addEventListener("click", closeUserCreateModalFn);
  if (userCreateModal) userCreateModal.addEventListener("click", (e) => e.target === userCreateModal && closeUserCreateModalFn());
  if (userCreateForm) userCreateForm.addEventListener("submit", handleCreateUser);

  if (cancelUserEdit) cancelUserEdit.addEventListener("click", closeUserEditModalFn);
  if (userEditForm) userEditForm.addEventListener("submit", handleUserEditSubmit);
  const startUp = document.getElementById("userEditStartUp");
  const startDown = document.getElementById("userEditStartDown");
  const endUp = document.getElementById("userEditEndUp");
  const endDown = document.getElementById("userEditEndDown");
  if (startUp) startUp.addEventListener("click", () => changeUserEditWorkHours("start", 1));
  if (startDown) startDown.addEventListener("click", () => changeUserEditWorkHours("start", -1));
  if (endUp) endUp.addEventListener("click", () => changeUserEditWorkHours("end", 1));
  if (endDown) endDown.addEventListener("click", () => changeUserEditWorkHours("end", -1));

  if (cancelUserDelete) cancelUserDelete.addEventListener("click", closeUserDeleteModalFn);
  if (userDeleteConfirmCheck && confirmUserDelete) {
    userDeleteConfirmCheck.addEventListener("change", () => {
      confirmUserDelete.disabled = !userDeleteConfirmCheck.checked;
    });
  }
  if (confirmUserDelete) confirmUserDelete.addEventListener("click", handleDeleteUserConfirm);
  if (userDeleteModal) userDeleteModal.addEventListener("click", (e) => e.target === userDeleteModal && closeUserDeleteModalFn());

  if (cancelRequestClose) cancelRequestClose.addEventListener("click", closeRequestCloseModalFn);
  if (requestCloseConfirmCheck && confirmRequestClose) {
    requestCloseConfirmCheck.addEventListener("change", () => {
      confirmRequestClose.disabled = !requestCloseConfirmCheck.checked;
    });
  }
  if (confirmRequestClose) confirmRequestClose.addEventListener("click", handleRequestCloseConfirm);
}

async function init() {
  if (!ensureSession()) return;
  await loadData();
  syncChatBridgeContext();
  if (typeof window.api.onMessagesUpdated === "function") {
    window.api.onMessagesUpdated((next) => {
      replaceMessagesInPlace(next);
      syncChatBridgeContext();
      if (activeViewKey === "mesajlar" && typeof window.__messagesPageRefresh === "function") {
        window.__messagesPageRefresh();
      }
    });
  }
  if (typeof window.api.onUsersUpdated === "function") {
    window.api.onUsersUpdated((next) => {
      const arr = Array.isArray(next) ? next : [];
      users.splice(0, users.length, ...arr.map(normalizeUser));
      const latest = users.find((u) => isSameUser(u, currentUser));
      if (latest) {
        currentUser = normalizeUser(latest);
        hydrateCurrentUserFromStores();
        localStorage.setItem("currentUser", JSON.stringify(currentUser));
        const nameEl = document.getElementById("sidebarUserName");
        const roleEl = document.getElementById("sidebarUserRole");
        const deptEl = document.getElementById("sidebarUserDept");
        if (nameEl) nameEl.textContent = getUserFullName(currentUser);
        if (roleEl) roleEl.textContent = String(currentUser.sirketUnvan || currentUser.rol || "Kullanici").toUpperCase();
        if (deptEl) deptEl.textContent = currentUser.departman || "-";
      }
      syncChatBridgeContext();
      if (activeViewKey === "mesajlar" && typeof window.__messagesPageRefresh === "function") {
        window.__messagesPageRefresh();
      }
      if (activeViewKey === "kullanicilar") renderUsers();
    });
  }
  if (typeof window.api.onUserPhotosUpdated === "function") {
    window.api.onUserPhotosUpdated((next) => {
      replaceUserPhotosInPlace(next);
      hydrateCurrentUserFromStores();
      syncChatBridgeContext();
      if (activeViewKey === "mesajlar" && typeof window.__messagesPageRefresh === "function") {
        window.__messagesPageRefresh();
      }
    });
  }
  bindShellEvents();
  const savedView = localStorage.getItem(LAST_ACTIVE_VIEW_KEY);
  const validView = navLinks.some((btn) => btn.dataset.view === savedView);
  const initialView = validView ? savedView : "gorevlerim";
  navLinks.forEach((item) => item.classList.remove("active"));
  const initialBtn = navLinks.find((btn) => btn.dataset.view === initialView);
  if (initialBtn) initialBtn.classList.add("active");
  await loadView(initialView);
}

init();
