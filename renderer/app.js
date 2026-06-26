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
/** Profil görselleri PocketBase user_photos koleksiyonunda (users.data dışında). */
let userPhotos = [];
let departmentNames = [];
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
let selectedQueueRequestId = "";
let selectedRejectRequestId = "";
const DEPT_EXPANDED_KEY = "deptExpanded";
const DEFAULT_DEPARTMENTS = [
  "Yazılım Geliştirme",
  "Yazılım",
  "Ürün Tasarımı",
  "Pazarlama",
  "Veri Analizi",
  "Yönetim",
  "Genel"
];
let taskSelectedAssigneeIds = new Set();
let taskAttachedFiles = [];
let activeTaskFlowTask = null;
let taskCompleteFiles = [];
let postponeDatePickerBound = false;
let postponeDatePickerState = { year: 0, month: 0 };
let portfolios = [];
let pendingEvalRequest = null;

const ROLE_ORDER = ["DEV", "MANAGER", "ADMIN", "LEADER", "STAJYER"];
const ROLE_LABEL_MAP = { MANAGER: "Müdür", LEADER: "Lider", ADMIN: "Personel", STAJYER: "Stajyer", DEV: ".dev" };
const ROLE_TITLE_MAP = { MANAGER: "Müdür", LEADER: "Takım Lideri", ADMIN: "Personel", STAJYER: "Stajyer", DEV: ".dev" };
const STAJYER_HIDDEN_VIEWS = new Set(["kullanicilar", "stajyerlerim", "erisim-ayarlari", "gorev-olustur"]);
const ACCENT_PRESETS = ["#6c63ff", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

const VIEW_META = {
  panel: { title: "Panel", search: false },
  "gelen-talepler": { title: "Gelen Talepler", search: false },
  gorevlerim: { title: "Görevlerim", search: false },
  departmanlar: { title: "Departmanlar", search: true, searchPlaceholder: "Departman ara..." },
  mesajlar: { title: "Mesajlar", search: true, searchPlaceholder: "Konuşma ara..." },
  profil: { title: "Profil", search: false },
  kullanicilar: { title: "Kullanıcılar", search: true, searchPlaceholder: "Kullanıcı ara..." },
  stajyerlerim: { title: "Stajyerlerim", search: true, searchPlaceholder: "Stajyer ara..." },
  "erisim-ayarlari": { title: "Erişim Ayarları", search: false }
};

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

function getSidebarRoleText(user) {
  const key = String(user?.rol || "").toUpperCase();
  return getRoleLabel(key) || "Kullanıcı";
}

function isStajyerRole(user = currentUser) {
  return String(user?.rol || "").toUpperCase() === "STAJYER";
}

function isDevRole(user = currentUser) {
  return String(user?.rol || "").toUpperCase() === "DEV";
}

/** .dev rolü uygulamadaki tüm özelliklere erişir (en geniş yetki). */
function hasFullAccess(user = currentUser) {
  return isDevRole(user);
}

function canAccessStaffFeatures(user = currentUser) {
  if (hasFullAccess(user)) return true;
  return !isStajyerRole(user);
}

function isViewBlockedForUser(viewKey, user = currentUser) {
  if (hasFullAccess(user)) return false;
  if (!isStajyerRole(user)) return false;
  return STAJYER_HIDDEN_VIEWS.has(viewKey);
}

function applyRoleBasedNav() {
  const staff = canAccessStaffFeatures();
  document.querySelectorAll(
    ".nav-link[data-requires-role='staff'], .nav-link[data-view='kullanicilar'], .nav-link[data-view='stajyerlerim'], [data-requires-role='staff']"
  ).forEach((btn) => {
    btn.classList.toggle("nav-link-hidden", !staff);
  });
}

function updateShellForView(viewKey) {
  const meta = VIEW_META[viewKey] || { title: viewKey, search: false };
  const titleEl = document.getElementById("topbarPageTitle");
  if (titleEl) titleEl.textContent = meta.title;

  const searchWrap = document.getElementById("topbarSearchWrap");
  const searchInput = document.getElementById("topbarSearch");
  if (searchWrap) {
    searchWrap.classList.toggle("is-visible", Boolean(meta.search));
    searchWrap.style.display = meta.search ? "" : "none";
  }
  if (searchInput) {
    searchInput.value = "";
    searchInput.placeholder = meta.searchPlaceholder || "Ara...";
    searchInput.oninput = null;
    if (viewKey === "stajyerlerim") {
      searchInput.oninput = (e) => {
        const q = String(e.target.value || "").trim().toLowerCase();
        document.querySelectorAll("#internCardGrid .intern-v2-card").forEach((card) => {
          const name = card.querySelector(".intern-v2-name")?.textContent?.toLowerCase() || "";
          card.style.display = !q || name.includes(q) ? "" : "none";
        });
      };
    } else if (viewKey === "kullanicilar") {
      searchInput.oninput = (e) => {
        const q = String(e.target.value || "").trim().toLowerCase();
        document.querySelectorAll("#usersTableBody tr").forEach((row) => {
          const text = row.textContent?.toLowerCase() || "";
          row.style.display = !q || text.includes(q) ? "" : "none";
        });
      };
    } else if (viewKey === "departmanlar") {
      searchInput.oninput = (e) => {
        const q = String(e.target.value || "").trim().toLowerCase();
        document.querySelectorAll(".departments-v2-row").forEach((row) => {
          const text = row.textContent?.toLowerCase() || "";
          row.style.display = !q || text.includes(q) ? "" : "none";
        });
      };
    } else if (viewKey === "mesajlar") {
      searchInput.oninput = (e) => {
        const convSearch = document.getElementById("conversationSearch");
        if (convSearch) {
          convSearch.value = e.target.value;
          convSearch.dispatchEvent(new Event("input", { bubbles: true }));
        }
      };
    }
  }

  if (viewRoot) viewRoot.classList.add("has-stitch-topbar");
}

function renderPanel() {
  const viewTasks = getTasksForCurrentUser();
  const activeTasks = viewTasks.filter((t) => String(t.status || "").toLowerCase().includes("devam"));
  const pendingRequests = getIncomingRequestsForUser().filter((r) => String(r.status || "").toLowerCase().includes("bekle"));
  const internCount = users.filter((u) => String(u.rol || "").toUpperCase() === "STAJYER").length;
  const doneTasks = viewTasks.filter((t) => String(t.status || "").toLowerCase().includes("tamamlanan"));

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  };
  setText("panelKpiTasks", activeTasks.length);
  setText("panelKpiRequests", pendingRequests.length);
  if (isStajyerRole(currentUser) && window.TaskWorkspace) {
    const stats = window.TaskWorkspace.calcInternSuccessStats(tasks, currentUser.id);
    setText("panelKpiInterns", stats.rate);
    setText("panelKpiDone", stats.completed);
    setText("panelKpiTasksSub", `%${stats.rate} tamamlama oranı`);
    setText("panelKpiRequestsSub", `${stats.onTimeRate}% zamanında teslim`);
    const internLabel = document.querySelector("#panelKpiGrid .stitch-kpi:nth-child(3) .stitch-kpi-label");
    const doneLabel = document.querySelector("#panelKpiGrid .stitch-kpi:nth-child(4) .stitch-kpi-label");
    if (internLabel) internLabel.textContent = "Başarı Oranı";
    if (doneLabel) doneLabel.textContent = "Tamamlanan";
  } else {
    setText("panelKpiInterns", internCount);
    setText("panelKpiDone", doneTasks.length);
    setText("panelKpiTasksSub", `${viewTasks.length} toplam görev`);
    setText("panelKpiRequestsSub", `${requests.length} toplam talep`);
  }

  const activityList = document.getElementById("panelActivityList");
  if (activityList) {
    const items = [];
    viewTasks.slice(0, 4).forEach((t) => {
      items.push({
        icon: "assignment",
        title: t.title || "Görev",
        sub: `${t.status || "—"} · ${t.sender || "Sistem"}`,
        time: t.dueDate || t.createdAt || ""
      });
    });
    requests.slice(0, 3).forEach((r) => {
      items.push({
        icon: "inbox",
        title: r.title || r.subject || "Talep",
        sub: String(r.status || "Bekliyor"),
        time: r.createdAt || ""
      });
    });
    if (!items.length) {
      activityList.innerHTML = `<p class="stitch-page-lead">Henüz aktivite yok.</p>`;
    } else {
      activityList.innerHTML = items
        .slice(0, 6)
        .map(
          (it) =>
            `<article class="stitch-activity-item">
              <div class="stitch-activity-icon"><span class="material-symbols-outlined">${it.icon}</span></div>
              <div class="stitch-activity-body">
                <strong>${escapeHtml(it.title)}</strong>
                <span>${escapeHtml(it.sub)}</span>
              </div>
              <time class="stitch-activity-time">${escapeHtml(formatDisplayDate(it.time))}</time>
            </article>`
        )
        .join("");
    }
  }

  const breakdown = document.getElementById("panelTaskBreakdown");
  if (breakdown) {
    const counts = {
      devam: viewTasks.filter((t) => String(t.status || "").toLowerCase().includes("devam")).length,
      tamamlanan: doneTasks.length,
      basarisiz: viewTasks.filter((t) => String(t.status || "").toLowerCase().includes("başarısız")).length,
      iptal: viewTasks.filter((t) => String(t.status || "").toLowerCase().includes("iptal")).length
    };
    breakdown.innerHTML = `
      <div class="stitch-kpi-grid" style="width:100%;padding:8px">
        <div class="stitch-kpi"><span class="stitch-kpi-label">Devam</span><span class="stitch-kpi-value">${counts.devam}</span></div>
        <div class="stitch-kpi"><span class="stitch-kpi-label">Tamamlanan</span><span class="stitch-kpi-value">${counts.tamamlanan}</span></div>
        <div class="stitch-kpi"><span class="stitch-kpi-label">Başarısız</span><span class="stitch-kpi-value">${counts.basarisiz}</span></div>
        <div class="stitch-kpi"><span class="stitch-kpi-label">İptal</span><span class="stitch-kpi-value">${counts.iptal}</span></div>
      </div>`;
  }

  document.querySelectorAll(".nav-staff-only").forEach((btn) => {
    btn.classList.toggle("hidden", !canAccessStaffFeatures());
  });

  document.querySelectorAll("#panelQuickActions [data-goto]").forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      const key = btn.dataset.goto;
      const navBtn = navLinks.find((n) => n.dataset.view === key);
      if (navBtn) {
        navLinks.forEach((item) => item.classList.remove("active"));
        navBtn.classList.add("active");
        localStorage.setItem(LAST_ACTIVE_VIEW_KEY, key);
        await loadView(key);
      }
    });
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function updateSidebarUserMeta() {
  const nameEl = document.getElementById("sidebarUserName");
  const roleEl = document.getElementById("sidebarUserRole");
  const deptEl = document.getElementById("sidebarUserDept");
  if (nameEl) nameEl.textContent = getUserFullName(currentUser);
  if (roleEl) roleEl.textContent = getSidebarRoleText(currentUser);
  if (deptEl) deptEl.textContent = currentUser?.departman || "-";
  renderSidebarAvatar(currentUser);
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
  if (normalized === "devam ediyor") return "Devam Eden";
  return "Devam Eden";
}

function getTasksForCurrentUser() {
  if (!isStajyerRole(currentUser) && !isDevRole(currentUser)) return tasks;
  const TW = window.TaskWorkspace;
  if (!TW?.taskBelongsToUser) return tasks;
  return tasks.filter((t) => TW.taskBelongsToUser(t, currentUser.id));
}

function navigateToTaskWorkspace(task) {
  if (!task?.taskId) return;
  closeTaskDetailModalFn();
  window.location.href = `./gorev-calisma.html?taskId=${encodeURIComponent(task.taskId)}`;
}

function sortRequestsQueuedFirst(list) {
  const queued = [];
  const rest = [];
  for (const item of list) {
    if (item?.status === "Bekletildi") queued.push(item);
    else rest.push(item);
  }
  queued.sort((a, b) => Number(b.queuedAt || 0) - Number(a.queuedAt || 0));
  return [...queued, ...rest];
}

function applyThemeFromStorage() {
  const theme = localStorage.getItem("appTheme") || "dark";
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
  const accent = localStorage.getItem("appAccent") || ACCENT_PRESETS[0];
  document.documentElement.style.setProperty("--primary", accent);
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--stitch-accent", accent);
  const r = parseInt(accent.slice(1, 3), 16);
  const g = parseInt(accent.slice(3, 5), 16);
  const b = parseInt(accent.slice(5, 7), 16);
  if (!Number.isNaN(r)) {
    document.documentElement.style.setProperty("--primary-soft", `rgba(${r}, ${g}, ${b}, 0.18)`);
    document.documentElement.style.setProperty("--stitch-accent-rgb", `${r}, ${g}, ${b}`);
  }
  document.querySelectorAll(".profile-v2-color").forEach((el, i) => {
    const hex = el.dataset.accent || ACCENT_PRESETS[i] || ACCENT_PRESETS[0];
    el.classList.toggle("active", hex.toLowerCase() === accent.toLowerCase());
  });
  const toggle = document.querySelector(".profile-v2-toggle");
  if (toggle) toggle.classList.toggle("is-on", theme !== "light");
  const themeIcon = theme === "light" ? "light_mode" : "dark_mode";
  document.querySelectorAll("#topbarThemeBtn .material-symbols-outlined, #sidebarThemeBtn .material-symbols-outlined").forEach((el) => {
    el.textContent = themeIcon;
  });
}

function bindProfileCustomization() {
  const toggle = document.querySelector(".profile-v2-toggle");
  if (toggle && !toggle.dataset.bound) {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", () => {
      const isLight = localStorage.getItem("appTheme") === "light";
      localStorage.setItem("appTheme", isLight ? "dark" : "light");
      applyThemeFromStorage();
    });
  }
  document.querySelectorAll(".profile-v2-color").forEach((el, i) => {
    const hex = ACCENT_PRESETS[i] || ACCENT_PRESETS[0];
    el.dataset.accent = hex;
    if (el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("click", () => {
      localStorage.setItem("appAccent", hex);
      applyThemeFromStorage();
    });
  });
}

function isTaskAssigneeRole(user) {
  const r = String(user?.rol || "").toUpperCase();
  return r === "STAJYER" || r === "DEV";
}

function getDeptExpandedSet() {
  try {
    const raw = JSON.parse(localStorage.getItem(DEPT_EXPANDED_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveDeptExpandedSet(set) {
  localStorage.setItem(DEPT_EXPANDED_KEY, JSON.stringify([...set]));
}

function getAllDepartmentNames() {
  const fromUsers = users.map((u) => String(u.departman || "").trim()).filter(Boolean);
  const all = new Set([...DEFAULT_DEPARTMENTS, ...departmentNames, ...fromUsers]);
  return [...all].sort((a, b) => a.localeCompare(b, "tr"));
}

function populateDepartmentSelects(preferredValue = "") {
  const names = getAllDepartmentNames();
  const fill = (selectEl, includeEmpty) => {
    if (!selectEl) return;
    const prev = preferredValue || selectEl.value;
    selectEl.innerHTML =
      (includeEmpty ? '<option value="">Departman Seçiniz</option>' : "") +
      names.map((n) => `<option value="${escapeHtmlAttr(n)}">${escapeHtmlAttr(n)}</option>`).join("");
    if (prev && names.includes(prev)) selectEl.value = prev;
  };
  fill(document.getElementById("newUserDepartment"), true);
  fill(document.getElementById("userEditDepartment"), false);
}

function escapeHtmlAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

let taskDatePickerState = { year: 0, month: 0, bound: false };

function formatTaskDateLabel(iso) {
  if (!iso) return "Tarih seçin";
  try {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  } catch {
    return iso;
  }
}

function closeTaskDatePopover() {
  const pop = document.getElementById("taskDatePopover");
  if (pop) pop.classList.add("hidden");
}

function renderTaskDatePopover() {
  const pop = document.getElementById("taskDatePopover");
  const hidden = document.getElementById("taskDueDate");
  if (!pop) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!taskDatePickerState.year) {
    taskDatePickerState.year = today.getFullYear();
    taskDatePickerState.month = today.getMonth();
  }
  const { year, month } = taskDatePickerState;
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = first.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  const selected = hidden?.value || "";
  const weekdays = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];
  let cells = "";
  for (let i = 0; i < startPad; i++) cells += '<span class="task-date-day empty"></span>';
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dt = new Date(year, month, day);
    const disabled = dt < today;
    const isSel = selected === iso;
    cells += `<button type="button" class="task-date-day ${disabled ? "disabled" : ""} ${isSel ? "selected" : ""}" data-iso="${iso}" ${disabled ? "disabled" : ""}>${day}</button>`;
  }
  pop.innerHTML = `
    <div class="task-date-pop-head">
      <button type="button" class="task-date-nav" data-nav="-1" aria-label="Önceki ay">‹</button>
      <strong>${monthLabel}</strong>
      <button type="button" class="task-date-nav" data-nav="1" aria-label="Sonraki ay">›</button>
    </div>
    <div class="task-date-weekdays">${weekdays.map((w) => `<span>${w}</span>`).join("")}</div>
    <div class="task-date-grid">${cells}</div>
    <button type="button" class="task-date-clear btn-ghost">Tarihi temizle</button>
  `;
  pop.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.onclick = () => {
      const delta = Number(btn.getAttribute("data-nav"));
      taskDatePickerState.month += delta;
      if (taskDatePickerState.month > 11) {
        taskDatePickerState.month = 0;
        taskDatePickerState.year += 1;
      } else if (taskDatePickerState.month < 0) {
        taskDatePickerState.month = 11;
        taskDatePickerState.year -= 1;
      }
      renderTaskDatePopover();
    };
  });
  pop.querySelectorAll(".task-date-day:not(.disabled):not(.empty)").forEach((btn) => {
    btn.onclick = () => {
      const iso = btn.getAttribute("data-iso");
      if (hidden) hidden.value = iso;
      const label = document.getElementById("taskDueDateLabel");
      if (label) label.textContent = formatTaskDateLabel(iso);
      closeTaskDatePopover();
    };
  });
  const clearBtn = pop.querySelector(".task-date-clear");
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (hidden) hidden.value = "";
      const label = document.getElementById("taskDueDateLabel");
      if (label) label.textContent = "Tarih seçin";
      closeTaskDatePopover();
    };
  }
}

function initTaskDatePicker() {
  const btn = document.getElementById("taskDueDateBtn");
  const pop = document.getElementById("taskDatePopover");
  if (!btn || !pop) return;
  if (!taskDatePickerState.bound) {
    taskDatePickerState.bound = true;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = pop.classList.contains("hidden");
      if (open) {
        const today = new Date();
        taskDatePickerState.year = today.getFullYear();
        taskDatePickerState.month = today.getMonth();
        renderTaskDatePopover();
        pop.classList.remove("hidden");
      } else {
        closeTaskDatePopover();
      }
    });
    document.addEventListener("click", (e) => {
      if (!pop.classList.contains("hidden") && !pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        closeTaskDatePopover();
      }
    });
  }
}

function resetTaskDatePicker() {
  const hidden = document.getElementById("taskDueDate");
  const label = document.getElementById("taskDueDateLabel");
  if (hidden) hidden.value = "";
  if (label) label.textContent = "Tarih seçin";
  closeTaskDatePopover();
}

async function openMessagesWithUser(user) {
  if (!user) return;
  const targetId = String(user.id);
  window.__pendingOpenChatUserId = targetId;
  const mesajBtn = navLinks.find((b) => b.dataset.view === "mesajlar");
  if (activeViewKey !== "mesajlar") {
    if (mesajBtn) {
      navLinks.forEach((item) => item.classList.remove("active"));
      mesajBtn.classList.add("active");
      localStorage.setItem(LAST_ACTIVE_VIEW_KEY, "mesajlar");
    }
    await loadView("mesajlar");
  }
  if (typeof window.__openChatWithUserId === "function") {
    await window.__openChatWithUserId(targetId);
    window.__pendingOpenChatUserId = "";
  }
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
  const [u, r, t, m, p, d, pf] = await Promise.all([
    window.api.listUsers(),
    window.api.listRequests(),
    window.api.listTasks(),
    window.api.listMessages(),
    window.api.listUserPhotos(),
    window.api.listDepartments(),
    typeof window.api.listPortfolios === "function" ? window.api.listPortfolios() : Promise.resolve([])
  ]);
  users = u;
  requests = r;
  tasks = t;
  replaceMessagesInPlace(m);
  replaceUserPhotosInPlace(p);
  portfolios = Array.isArray(pf) ? pf : [];
  departmentNames = Array.isArray(d) ? d.map((x) => String(x).trim()).filter(Boolean) : [];
  populateDepartmentSelects();
  hydrateCurrentUserFromStores();
  applyThemeFromStorage();
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
  updateSidebarUserMeta();
  applyRoleBasedNav();
  return true;
}

async function loadView(viewKey) {
  if (isViewBlockedForUser(viewKey)) {
    viewKey = "gorevlerim";
  }
  activeViewKey = viewKey;
  updateShellForView(viewKey);
  window.__messagesPageRefresh = null;
  window.__openChatWithUserId = null;
  const html = await fetch(`./pages/${viewKey}.html`).then((r) => r.text());
  viewRoot.innerHTML = html;
  viewRoot.classList.toggle("messages-view", viewKey === "mesajlar");
  viewRoot.classList.toggle("tasks-view", viewKey === "gorevlerim");
  viewRoot.classList.toggle("users-view", viewKey === "kullanicilar");
  viewRoot.classList.toggle("intern-panel-view", viewKey === "stajyerlerim");

  if (viewKey === "panel") renderPanel();
  if (viewKey === "gelen-talepler") renderRequests();
  if (viewKey === "gorevlerim") renderTasks();
  if (viewKey === "departmanlar") renderDepartments();
  if (viewKey === "kullanicilar") renderUsers();
  if (viewKey === "profil") renderProfile();
  if (viewKey === "stajyerlerim" && typeof window.initStajyerlerimPage === "function") {
    window.initStajyerlerimPage({
      users,
      tasks,
      portfolios,
      currentUser,
      getUserFullName,
      getUserPhotoById,
      hasFullAccess,
      savePortfolios: async (next) => {
        const result = await window.api.savePortfolios(next);
        if (!result?.ok) throw new Error(result?.error || "Portfolyolar kaydedilemedi.");
        portfolios = next;
      },
      setPortfolios: (next) => {
        portfolios = next;
      }
    });
  }
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
    if (window.__pendingOpenChatUserId && typeof window.__openChatWithUserId === "function") {
      const pendingId = window.__pendingOpenChatUserId;
      window.__pendingOpenChatUserId = "";
      await window.__openChatWithUserId(pendingId);
    }
  }
}

function isAssignmentRequest(req) {
  const kind = String(req?.requestKind || "").toLowerCase();
  if (kind === "assignment") return true;
  if (!req?.requestKind && req?.assignees && !req?.relatedTaskId) return true;
  return false;
}

function requestVisibleToAssignee(req, uid) {
  const assigneeId = String(req.assigneeId || "").trim();
  if (assigneeId) return assigneeId === uid;
  const me = getUserFullName(currentUser).toLowerCase();
  const names = String(req.assignees || "")
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return names.includes(me);
}

function getIncomingRequestsForUser() {
  const uid = String(currentUser?.id ?? "");

  return requests.filter((r) => {
    if (isAssignmentRequest(r)) {
      return requestVisibleToAssignee(r, uid);
    }
    const assignerId = String(r.assignerId || "").trim();
    if (assignerId) return assignerId === uid;
    return String(r.senderId || "") !== uid;
  });
}

function resolveTaskAssigner(task) {
  const owner = findUserBySender(task.senderId, task.sender);
  return {
    id: String(task.senderId || owner?.id || ""),
    name: task.sender || getUserFullName(owner) || "-",
    user: owner
  };
}

function formatDisplayDate(iso) {
  if (!iso) return "Belirtilmedi";
  try {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function buildInternRequestDescription(task, extras) {
  const lines = [
    `Görev: ${task.title || "-"}`,
    `Açıklama: ${task.description || "-"}`,
    ...extras.filter(Boolean)
  ];
  return lines.join("\n");
}

async function pushRequestToAssigner(payload) {
  requests.unshift(payload);
  requests = sortRequestsQueuedFirst(requests);
  await window.api.saveRequests(requests);
}

async function renderRequests() {
  const list = document.getElementById("requestList");
  if (!list) return;
  const incoming = getIncomingRequestsForUser();
  if (!incoming.length) {
    list.innerHTML = '<div class="requests-v2-empty">Size atanan bir gorev yada talep bulunmuyor</div>';
    return;
  }
  const sortedRequests = sortRequestsQueuedFirst(incoming);
  list.innerHTML = sortedRequests
    .map((req) => {
      const owner = findUserBySender(req.senderId, req.sender);
      const senderName = req.sender || getUserFullName(owner);
      const ownerPhoto = owner ? getUserPhotoById(owner.id) || owner.profilFoto : "";
      const avatar = ownerPhoto
        ? `<img src="${ownerPhoto}" alt="${senderName}" style="width:100%;height:100%;object-fit:cover;border-radius:999px;" />`
        : getUserInitials(owner || { ad_soyad: senderName });
      const queued = req.status === "Bekletildi";
      const remainingDaysRaw = req.dueDate ? daysLeft(req.dueDate) : null;
      const hasFiniteDue = Number.isFinite(remainingDaysRaw);
      const remainingDays = hasFiniteDue ? remainingDaysRaw : null;
      const isPostponeReq = req.requestKind === "postponement";
      const isCompletionReq = req.requestKind === "completion";
      const isInternReq = isPostponeReq || isCompletionReq;
      const dueText = isPostponeReq
        ? `Yeni teslim: ${formatDisplayDate(req.dueDate)}${req.previousDueDate ? ` (önceki: ${formatDisplayDate(req.previousDueDate)})` : ""}`
        : hasFiniteDue
          ? `${remainingDays} Gün Kaldı`
          : req.dueDate
            ? `Son Tarih: ${req.dueDate}`
            : "Son tarih yok";
      const priorityClass =
        req.priority === "Kritik"
          ? "kritik"
          : req.priority === "Önemli" || req.priority === "Onemli"
            ? "onemli"
            : req.priority === "Orta"
              ? "orta"
              : "dusuk";
      const kindLabel =
        req.requestKind === "postponement"
          ? "Erteleme Talebi"
          : req.requestKind === "completion"
            ? "Tamamlama Talebi"
            : "";
      const priorityLabel = queued ? "Sıraya Alındı" : kindLabel || req.priority || "Düşük";
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
        <div class="request-actions ${isInternReq ? "request-actions-intern" : ""}">
          ${
            isInternReq && !queued
              ? `<button class="btn-primary requests-v2-btn" data-action="accept" data-id="${req.id}">Onayla</button>
                 <button class="btn-ghost requests-v2-btn btn-reject" data-action="reject" data-id="${req.id}">${isPostponeReq ? "Ertelemeyi Reddet" : "Reddet"}</button>`
              : `<button class="btn-primary requests-v2-btn" data-action="accept" data-id="${req.id}">${queued ? "Şimdi Başlat" : "Kabul Et"}</button>
                 ${queued ? "" : `<button class="btn-ghost requests-v2-btn btn-reject" data-action="reject" data-id="${req.id}">Görevi Reddet</button>`}
                 ${queued ? "" : `<button class="btn-ghost requests-v2-btn btn-queue" data-action="hold" data-id="${req.id}"><span class="requests-v2-btn-icon">⊞</span>Sıraya Al</button>`}
                 ${queued ? `<button class="btn-ghost requests-v2-btn" data-action="close" data-id="${req.id}"><span class="requests-v2-btn-icon">✕</span>Talebi Kapat</button>` : ""}`
          }
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
      if (req.requestKind === "postponement") {
        const task = findTaskByRelatedId(req.relatedTaskId);
        if (task) {
          task.dueDate = req.dueDate || task.dueDate;
          task.postponementStatus = "";
          task.postponementReason = "";
        }
        requests = requests.filter((r) => r.id !== req.id);
        await Promise.all([window.api.saveRequests(requests), window.api.saveTasks(tasks)]);
        renderRequests();
        return;
      }
      if (req.requestKind === "completion") {
        openTaskEvalModal(req);
        return;
      }
      const acceptedAt = req.startMode === "assigned" ? req.createdAt || new Date().toISOString() : new Date().toISOString();
      tasks.unshift({
        title: req.title,
        description: req.description,
        sender: req.assignerName || req.sender,
        senderId: req.assignerId || req.senderId,
        department: req.department,
        priority: req.priority,
        dueDate: req.dueDate || "",
        startMode: req.startMode,
        attachment: req.attachment || "",
        category: req.category || "Genel",
        estimatedHours: req.estimatedHours || null,
        assignees: String(req.assigneeId || req.assignees || ""),
        taskId: `task-${req.id}`,
        status: "Devam Eden",
        acceptedAt,
        postponementStatus: "",
        postponementReason: "",
        createdAt: req.createdAt || new Date().toISOString()
      });
      requests = requests.filter((r) => r.id !== req.id);
      await Promise.all([window.api.saveRequests(requests), window.api.saveTasks(tasks)]);
      renderRequests();
      return;
    }
    if (actionEl.dataset.action === "reject") {
      openRequestRejectModal(req);
      return;
    }
    if (actionEl.dataset.action === "hold") {
      openRequestQueueModal(req);
      return;
    }
    if (actionEl.dataset.action === "close") {
      openRequestCloseModal(req);
    }
  };
}

function openTaskEvalModal(request) {
  const modal = document.getElementById("taskEvalModal");
  const titleEl = document.getElementById("taskEvalTaskTitle");
  const internEl = document.getElementById("taskEvalInternName");
  const idInput = document.getElementById("taskEvalRequestId");
  const err = document.getElementById("taskEvalError");
  if (!modal || !request) return;
  pendingEvalRequest = request;
  const task = findTaskByRelatedId(request.relatedTaskId);
  if (titleEl) titleEl.textContent = task?.title || request.title || "Görev";
  if (internEl) {
    internEl.textContent = `Stajyer: ${request.sender || getUserFullName(findUserBySender(request.senderId, request.sender))}`;
  }
  if (err) err.textContent = "";
  const form = document.getElementById("taskEvalForm");
  if (form) form.reset();
  if (idInput) idInput.value = String(request.id || "");
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeTaskEvalModalFn() {
  const modal = document.getElementById("taskEvalModal");
  if (modal) modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  pendingEvalRequest = null;
  const err = document.getElementById("taskEvalError");
  if (err) err.textContent = "";
}

function computeActualDurationDays(task, completedAtIso) {
  const startRaw = task?.acceptedAt || task?.createdAt;
  const endRaw = completedAtIso || task?.completedAt;
  if (!startRaw || !endRaw) return null;
  try {
    const days = Math.ceil((new Date(endRaw).getTime() - new Date(startRaw).getTime()) / 86400000);
    return Math.max(1, days);
  } catch {
    return null;
  }
}

async function handleTaskEvalSubmit(event) {
  event.preventDefault();
  const err = document.getElementById("taskEvalError");
  if (err) err.textContent = "";
  const req = pendingEvalRequest;
  if (!req) return;
  const quality = Number(document.getElementById("taskEvalQuality")?.value);
  const independence = Number(document.getElementById("taskEvalIndependence")?.value);
  const note = document.getElementById("taskEvalNote")?.value.trim() || "";
  if (!quality || !independence || !note) {
    if (err) err.textContent = "Kalite, bağımsızlık ve not zorunludur.";
    return;
  }
  const task = findTaskByRelatedId(req.relatedTaskId);
  if (!task) {
    if (err) err.textContent = "İlgili görev bulunamadı.";
    return;
  }
  const now = new Date().toISOString();
  task.status = "Tamamlanan";
  task.completedAt = now;
  task.submittedAt = task.submittedAt || req.createdAt || now;
  task.actualDurationDays = computeActualDurationDays(task, now);
  task.mentorEvaluation = {
    quality,
    independence,
    note,
    evaluatedAt: now,
    evaluatedBy: currentUser?.id,
    evaluatedByName: getUserFullName(currentUser),
    evidenceLink: req.solutionLink || "",
    evidenceNote: req.internNote || ""
  };
  requests = requests.filter((r) => r.id !== req.id);
  await Promise.all([window.api.saveRequests(requests), window.api.saveTasks(tasks)]);
  closeTaskEvalModalFn();
  renderRequests();
  if (activeViewKey === "gorevlerim") renderTasks();
  if (activeViewKey === "stajyerlerim" && typeof window.__stajyerlerimRefresh === "function") {
    window.__stajyerlerimRefresh();
  }
}

function openRequestQueueModal(request) {
  const modal = document.getElementById("requestQueueModal");
  const desc = document.getElementById("requestQueueDescription");
  if (!modal || !request) return;
  selectedQueueRequestId = String(request.id || "");
  if (desc) {
    desc.textContent = `"${request.title || "Görev"}" sıraya alınacak ve listenin en üstüne taşınacak. Bu işlem geri alınamaz.`;
  }
  modal.classList.remove("hidden");
}

function closeRequestQueueModalFn() {
  const modal = document.getElementById("requestQueueModal");
  if (modal) modal.classList.add("hidden");
  selectedQueueRequestId = "";
}

function openRequestRejectModal(request) {
  const modal = document.getElementById("requestRejectModal");
  const senderEl = document.getElementById("requestRejectSender");
  const titleEl = document.getElementById("requestRejectTaskTitle");
  const check = document.getElementById("requestRejectConfirmCheck");
  const confirmBtn = document.getElementById("confirmRequestReject");
  if (!modal || !request) return;
  selectedRejectRequestId = String(request.id || "");
  const owner = findUserBySender(request.senderId, request.sender);
  const senderName = request.sender || getUserFullName(owner) || "-";
  if (senderEl) senderEl.textContent = senderName;
  if (titleEl) titleEl.textContent = request.title || "-";
  if (check) check.checked = false;
  if (confirmBtn) confirmBtn.disabled = true;
  modal.classList.remove("hidden");
}

function closeRequestRejectModalFn() {
  const modal = document.getElementById("requestRejectModal");
  if (modal) modal.classList.add("hidden");
  selectedRejectRequestId = "";
  const check = document.getElementById("requestRejectConfirmCheck");
  const confirmBtn = document.getElementById("confirmRequestReject");
  if (check) check.checked = false;
  if (confirmBtn) confirmBtn.disabled = true;
}

async function handleRequestRejectConfirm() {
  if (!selectedRejectRequestId) return;
  const req = requests.find((r) => String(r.id) === selectedRejectRequestId);
  if (req?.requestKind === "postponement") {
    const task = findTaskByRelatedId(req.relatedTaskId);
    if (task) {
      task.postponementStatus = "Reddedildi";
      task.postponementReason = "";
      await window.api.saveTasks(tasks);
    }
  }
  requests = requests.filter((r) => String(r.id) !== selectedRejectRequestId);
  await window.api.saveRequests(requests);
  closeRequestRejectModalFn();
  renderRequests();
}

async function handleRequestQueueConfirm() {
  if (!selectedQueueRequestId) return;
  const req = requests.find((r) => String(r.id) === selectedQueueRequestId);
  if (!req) return;
  req.status = "Bekletildi";
  req.queuedAt = Date.now();
  requests = sortRequestsQueuedFirst([req, ...requests.filter((r) => r.id !== req.id)]);
  await window.api.saveRequests(requests);
  closeRequestQueueModalFn();
  renderRequests();
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

function toIsoLocalDate(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function getPostponeMinIso(task) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let min = today;
  if (task?.dueDate) {
    const due = new Date(task.dueDate);
    if (!Number.isNaN(due.getTime())) {
      due.setHours(0, 0, 0, 0);
      due.setDate(due.getDate() + 1);
      if (due > min) min = due;
    }
  }
  return toIsoLocalDate(min);
}

function findTaskByRelatedId(relatedTaskId) {
  const id = String(relatedTaskId || "");
  if (!id) return null;
  return tasks.find((t) => String(t.taskId) === id || String(t.id) === id) || null;
}

function syncPostponeReasonUI() {
  const reasonSel = document.getElementById("taskPostponeReason");
  const otherWrap = document.getElementById("taskPostponeOtherWrap");
  const detailsWrap = document.getElementById("taskPostponeDetailsWrap");
  const otherInput = document.getElementById("taskPostponeOtherReason");
  const isOther = reasonSel?.value === "Diğer";
  if (otherWrap) otherWrap.classList.toggle("hidden", !isOther);
  if (detailsWrap) detailsWrap.classList.toggle("with-other-reason", isOther);
  if (otherInput) {
    otherInput.required = isOther;
    if (!isOther) otherInput.value = "";
  }
}

function renderTaskSuccessPanel() {
  const panel = document.getElementById("taskSuccessPanel");
  if (!panel || !window.TaskWorkspace || !currentUser?.id) return;
  const stats = window.TaskWorkspace.calcInternSuccessStats(tasks, currentUser.id);
  if (!stats.total && !isStajyerRole(currentUser)) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div class="tasks-success-card"><strong>${stats.total}</strong><span>Toplam görev</span></div>
    <div class="tasks-success-card"><strong>${stats.completed}</strong><span>Tamamlanan</span></div>
    <div class="tasks-success-card"><strong>${stats.active}</strong><span>Devam eden</span></div>
    <div class="tasks-success-card"><strong>%${stats.rate}</strong><span>Başarı oranı</span></div>
    <div class="tasks-success-bar-wrap">
      <div style="display:flex;justify-content:space-between;font-size:0.85rem">
        <span>Genel ilerleme</span>
        <span>%${stats.rate} tamamlama · %${stats.onTimeRate} zamanında</span>
      </div>
      <div class="tasks-success-bar"><div class="tasks-success-bar-fill" style="width:${stats.rate}%"></div></div>
    </div>`;
}

function buildTaskCard(task) {
  const postponePending = task.postponementStatus === "Bekliyor";
  const left = daysLeft(task.dueDate);
  const business = businessDaysBetween(task.acceptedAt || new Date().toISOString());
  const statusLabel = postponePending ? "Yanıt bekleniyor" : normalizeTaskStatusLabel(task.status);
  const priorityClass =
    task.priority === "Kritik"
      ? "kritik"
      : task.priority === "Önemli" || task.priority === "Onemli"
        ? "onemli"
        : task.priority === "Orta"
          ? "orta"
          : "dusuk";
  const deadlineText = postponePending
    ? "Erteleme talep edildi"
    : left === null
      ? "Belirli deadline yok"
      : `${left} Gün Kaldı`;
  const deadlineClass = postponePending
    ? "warning"
    : left !== null && left <= 3
      ? "danger"
      : left !== null && left <= 6
        ? "warning"
        : "";
  const cardToneClass =
    deadlineClass === "danger"
      ? "due-danger"
      : deadlineClass === "warning"
        ? "due-warning"
        : `priority-${priorityClass}`;
  const TW = window.TaskWorkspace;
  const canWork = TW?.isActiveTask ? TW.isActiveTask(task) : String(task.status || "").toLowerCase().includes("devam");
  const workBtn = canWork
    ? `<button class="btn-ghost tasks-v2-detail-btn tasks-v2-work-btn" data-action="open-work" data-id="${task.taskId}">Çalışma Alanına Git</button>`
    : "";
  return `
  <article class="task-card tasks-v2-card ${cardToneClass} ${postponePending ? "postpone-pending" : ""}" data-task-id="${task.taskId}">
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
      <div class="tasks-v2-card-actions">
        ${workBtn}
        <button class="btn-ghost tasks-v2-detail-btn" data-action="open-detail" data-id="${task.taskId}">Detay</button>
      </div>
    </div>
  </article>`;
}

async function renderTasks() {
  const list = document.getElementById("taskList");
  const count = document.getElementById("taskCount");
  const tabs = document.getElementById("taskTabs");
  if (!list || !count || !tabs) return;
  const viewTasks = getTasksForCurrentUser();
  const filtered = viewTasks.filter((t) => normalizeTaskStatusLabel(t.status) === activeTaskFilter);
  renderTaskSuccessPanel();
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
      if (action === "open-work") {
        navigateToTaskWorkspace(task);
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

function closeTaskCompleteModalFn() {
  const modal = document.getElementById("taskCompleteModal");
  if (modal) modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  taskCompleteFiles = [];
  activeTaskFlowTask = null;
  const form = document.getElementById("taskCompleteForm");
  if (form) form.reset();
  const err = document.getElementById("taskCompleteError");
  if (err) err.textContent = "";
  const list = document.getElementById("taskCompleteFileList");
  if (list) list.innerHTML = "";
}

function openTaskCompleteModal(task) {
  if (!task) return;
  activeTaskFlowTask = task;
  const modal = document.getElementById("taskCompleteModal");
  const idInput = document.getElementById("taskCompleteTaskId");
  if (idInput) idInput.value = String(task.taskId || "");
  taskCompleteFiles = [];
  initTaskCompleteFileUpload();
  if (modal) {
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }
  closeTaskDetailModalFn();
}

function initTaskCompleteFileUpload() {
  const drop = document.getElementById("taskCompleteFileDrop");
  const input = document.getElementById("taskCompleteFileInput");
  const browse = document.getElementById("taskCompleteFileBrowse");
  const list = document.getElementById("taskCompleteFileList");
  if (!drop || !input || !list) return;

  const renderList = () => {
    list.innerHTML = taskCompleteFiles
      .map(
        (f, i) =>
          `<li class="task-file-item"><span>${f.name}</span><button type="button" data-remove-complete-file="${i}" class="btn-ghost">✕</button></li>`
      )
      .join("");
    list.querySelectorAll("[data-remove-complete-file]").forEach((btn) => {
      btn.onclick = () => {
        taskCompleteFiles.splice(Number(btn.getAttribute("data-remove-complete-file")), 1);
        renderList();
      };
    });
  };

  const addFiles = (fileList) => {
    for (const file of fileList) {
      if (file.size > 25 * 1024 * 1024) continue;
      taskCompleteFiles.push(file);
    }
    renderList();
  };

  if (!drop.dataset.bound) {
    drop.dataset.bound = "1";
    browse?.addEventListener("click", (e) => {
      e.preventDefault();
      input.click();
    });
    drop.addEventListener("click", (e) => {
      if (e.target === browse) return;
      input.click();
    });
    input.addEventListener("change", () => {
      addFiles(input.files || []);
      input.value = "";
    });
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("drag-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("drag-over");
      addFiles(e.dataTransfer?.files || []);
    });
  }
  renderList();
}

async function handleTaskCompleteSubmit(event) {
  event.preventDefault();
  const err = document.getElementById("taskCompleteError");
  if (err) err.textContent = "";
  const task = activeTaskFlowTask;
  if (!task) return;
  const link = document.getElementById("taskCompleteLink")?.value.trim() || "";
  const note = document.getElementById("taskCompleteNote")?.value.trim() || "";
  if (!link && !note && !taskCompleteFiles.length) {
    if (err) err.textContent = "En az bir dosya, bağlantı veya not ekleyin.";
    return;
  }
  const assigner = resolveTaskAssigner(task);
  if (!assigner.id) {
    if (err) err.textContent = "Görevi atayan kişi bulunamadı.";
    return;
  }
  const attachment = taskCompleteFiles.map((f) => f.name).join(", ");
  const description = buildInternRequestDescription(task, [
    `Çözüm bağlantısı: ${link || "-"}`,
    `Stajyer notu: ${note || "-"}`,
    attachment ? `Dosyalar: ${attachment}` : ""
  ]);
  await pushRequestToAssigner({
    id: String(Date.now()),
    requestKind: "completion",
    title: `[Tamamlama] ${task.title || "Görev"}`,
    description,
    sender: getUserFullName(currentUser),
    senderId: currentUser.id,
    assignerId: assigner.id,
    assignerName: assigner.name,
    relatedTaskId: task.taskId || "",
    department: currentUser.departman || task.department || "-",
    priority: task.priority || "Orta",
    dueDate: task.dueDate || "",
    solutionLink: link,
    internNote: note,
    attachment,
    status: "Yanit Bekliyor",
    createdAt: new Date().toISOString()
  });
  task.submittedAt = new Date().toISOString();
  await window.api.saveTasks(tasks);
  closeTaskCompleteModalFn();
  if (activeViewKey === "gorevlerim") renderTasks();
}

function closeTaskPostponeModalFn() {
  const modal = document.getElementById("taskPostponeModal");
  if (modal) modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  activeTaskFlowTask = null;
  const form = document.getElementById("taskPostponeForm");
  if (form) form.reset();
  const err = document.getElementById("taskPostponeError");
  if (err) err.textContent = "";
  resetPostponeDatePicker();
  const otherWrap = document.getElementById("taskPostponeOtherWrap");
  if (otherWrap) otherWrap.classList.add("hidden");
}

function resetPostponeDatePicker() {
  const hidden = document.getElementById("taskPostponeNewDate");
  const label = document.getElementById("taskPostponeDateLabel");
  if (hidden) hidden.value = "";
  if (label) label.textContent = "Tarih seçin";
  const pop = document.getElementById("taskPostponeDatePopover");
  if (pop) pop.classList.add("hidden");
}

function renderPostponeDatePopover() {
  const pop = document.getElementById("taskPostponeDatePopover");
  const hidden = document.getElementById("taskPostponeNewDate");
  if (!pop) return;
  const minIso = getPostponeMinIso(activeTaskFlowTask);
  const minParts = minIso.split("-").map(Number);
  const minDate = new Date(minParts[0], minParts[1] - 1, minParts[2]);
  if (!postponeDatePickerState.year) {
    postponeDatePickerState.year = minDate.getFullYear();
    postponeDatePickerState.month = minDate.getMonth();
  }
  const { year, month } = postponeDatePickerState;
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = first.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  const selected = hidden?.value || "";
  const weekdays = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];
  let cells = "";
  for (let i = 0; i < startPad; i++) cells += '<span class="task-date-day empty"></span>';
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const disabled = iso < minIso;
    const isSel = selected === iso;
    cells += `<button type="button" class="task-date-day ${disabled ? "disabled" : ""} ${isSel ? "selected" : ""}" data-iso="${iso}" ${disabled ? "disabled" : ""}>${day}</button>`;
  }
  pop.innerHTML = `
    <div class="task-date-pop-head">
      <button type="button" class="task-date-nav" data-postpone-nav="-1">‹</button>
      <strong>${monthLabel}</strong>
      <button type="button" class="task-date-nav" data-postpone-nav="1">›</button>
    </div>
    <div class="task-date-weekdays">${weekdays.map((w) => `<span>${w}</span>`).join("")}</div>
    <div class="task-date-grid">${cells}</div>`;
  pop.querySelectorAll("[data-postpone-nav]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      postponeDatePickerState.month += Number(btn.getAttribute("data-postpone-nav"));
      if (postponeDatePickerState.month > 11) {
        postponeDatePickerState.month = 0;
        postponeDatePickerState.year += 1;
      } else if (postponeDatePickerState.month < 0) {
        postponeDatePickerState.month = 11;
        postponeDatePickerState.year -= 1;
      }
      renderPostponeDatePopover();
    });
  });
  pop.querySelectorAll(".task-date-day:not(.disabled):not(.empty)").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const iso = btn.getAttribute("data-iso");
      if (hidden) hidden.value = iso;
      const label = document.getElementById("taskPostponeDateLabel");
      if (label) label.textContent = formatTaskDateLabel(iso);
      pop.classList.add("hidden");
    });
  });
}

function initPostponeDatePicker() {
  const btn = document.getElementById("taskPostponeDateBtn");
  const pop = document.getElementById("taskPostponeDatePopover");
  const wrap = btn?.closest(".task-date-picker-wrap");
  if (!btn || !pop) return;
  postponeDatePickerState = { year: 0, month: 0 };
  if (!postponeDatePickerBound) {
    postponeDatePickerBound = true;
    pop.addEventListener("click", (e) => e.stopPropagation());
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (pop.classList.contains("hidden")) {
        renderPostponeDatePopover();
        pop.classList.remove("hidden");
      } else {
        pop.classList.add("hidden");
      }
    });
    document.addEventListener("click", (e) => {
      if (pop.classList.contains("hidden")) return;
      if (wrap?.contains(e.target)) return;
      pop.classList.add("hidden");
    });
  }
}

function openTaskPostponeModal(task) {
  if (!task) return;
  activeTaskFlowTask = task;
  const modal = document.getElementById("taskPostponeModal");
  const idInput = document.getElementById("taskPostponeTaskId");
  if (idInput) idInput.value = String(task.taskId || "");
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set("taskPostponeBreadcrumb", task.title || "-");
  set("taskPostponeTaskName", task.title || "-");
  set("taskPostponeCurrentDue", formatDisplayDate(task.dueDate));
  set("taskPostponePriority", task.priority || "-");
  resetPostponeDatePicker();
  postponeDatePickerState = { year: 0, month: 0 };
  initPostponeDatePicker();
  syncPostponeReasonUI();
  const reasonSel = document.getElementById("taskPostponeReason");
  if (reasonSel && !reasonSel.dataset.bound) {
    reasonSel.dataset.bound = "1";
    reasonSel.addEventListener("change", syncPostponeReasonUI);
  }
  if (modal) {
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }
  closeTaskDetailModalFn();
}

async function handleTaskPostponeSubmit(event) {
  event.preventDefault();
  const err = document.getElementById("taskPostponeError");
  if (err) err.textContent = "";
  const task = activeTaskFlowTask;
  if (!task) return;
  const newDate = document.getElementById("taskPostponeNewDate")?.value || "";
  const reason = document.getElementById("taskPostponeReason")?.value || "";
  const otherReason = document.getElementById("taskPostponeOtherReason")?.value.trim() || "";
  const details = document.getElementById("taskPostponeDetails")?.value.trim() || "";
  const minIso = getPostponeMinIso(task);
  if (!newDate) {
    if (err) err.textContent = "Yeni teslim tarihi seçin.";
    return;
  }
  if (newDate < minIso) {
    if (err) err.textContent = "Geçmiş veya mevcut teslim tarihinden önceki bir gün seçilemez.";
    return;
  }
  if (!reason) {
    if (err) err.textContent = "Erteleme nedeni seçin.";
    return;
  }
  if (reason === "Diğer" && otherReason.length < 5) {
    if (err) err.textContent = "Diğer seçildiğinde sebep en az 5 karakter olmalı.";
    return;
  }
  if (details.length < 10) {
    if (err) err.textContent = "Mazeret detayı en az 10 karakter olmalı.";
    return;
  }
  const reasonFinal = reason === "Diğer" ? `Diğer: ${otherReason}` : reason;
  const assigner = resolveTaskAssigner(task);
  if (!assigner.id) {
    if (err) err.textContent = "Görevi atayan kişi bulunamadı.";
    return;
  }
  const description = buildInternRequestDescription(task, [
    `Mevcut teslim: ${formatDisplayDate(task.dueDate)}`,
    `Yeni teslim: ${formatDisplayDate(newDate)}`,
    `Neden: ${reasonFinal}`,
    `Detay: ${details}`
  ]);
  await pushRequestToAssigner({
    id: String(Date.now()),
    requestKind: "postponement",
    title: `[Erteleme] ${task.title || "Görev"}`,
    description,
    sender: getUserFullName(currentUser),
    senderId: currentUser.id,
    assignerId: assigner.id,
    assignerName: assigner.name,
    relatedTaskId: task.taskId || task.id || "",
    department: currentUser.departman || task.department || "-",
    priority: task.priority || "Orta",
    dueDate: newDate,
    previousDueDate: task.dueDate || "",
    postponeReason: reasonFinal,
    postponeDetails: details,
    status: "Yanit Bekliyor",
    createdAt: new Date().toISOString()
  });
  task.postponementStatus = "Bekliyor";
  task.postponementReason = reasonFinal;
  await window.api.saveTasks(tasks);
  closeTaskPostponeModalFn();
  if (activeViewKey === "gorevlerim") renderTasks();
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

  const postponeBtn = document.getElementById("taskDetailPostponeBtn");
  const submitBtn = document.getElementById("taskDetailSubmitBtn");
  if (postponeBtn) {
    postponeBtn.style.display = task.dueDate ? "" : "none";
    postponeBtn.onclick = () => openTaskPostponeModal(task);
  }
  if (submitBtn) {
    const TW = window.TaskWorkspace;
    const s = TW?.normalizeStatus(task.status) || "";
    const inProgress = s === "devam ediyor" || task.workStartedAt;
    const paused = s === "ara verilen";
    submitBtn.innerHTML = paused
      ? 'Çalışmaya Devam Et <span>▷</span>'
      : inProgress
        ? 'Çalışmaya Devam Et <span>▷</span>'
        : 'Göreve Başla <span>▷</span>';
    submitBtn.onclick = () => navigateToTaskWorkspace(task);
  }
  const mailBtn = taskDetailModal.querySelector(".task-detail-mail-btn");
  if (mailBtn) {
    mailBtn.onclick = () => {
      if (owner) openMessagesWithUser(owner);
    };
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
  const searchInput = document.querySelector(".departments-v2-search");
  const addBtn = document.querySelector(".departments-v2-add-btn");
  if (addBtn) addBtn.classList.toggle("hidden", !canAccessStaffFeatures());
  if (!rows || !stats) return;

  const q = String(searchInput?.value || "").trim().toLowerCase();
  const allNames = new Set([...departmentNames, ...users.map((u) => u.departman || "Genel").filter(Boolean)]);
  const byDep = {};
  for (const name of allNames) byDep[name] = [];
  for (const u of users) {
    const key = u.departman || "Genel";
    if (!byDep[key]) byDep[key] = [];
    byDep[key].push(u);
  }

  let deps = Object.entries(byDep).sort((a, b) => a[0].localeCompare(b[0], "tr"));
  if (q) {
    deps = deps.filter(([name, members]) => {
      if (name.toLowerCase().includes(q)) return true;
      return members.some((m) => getUserFullName(m).toLowerCase().includes(q));
    });
  }

  const expandedSet = getDeptExpandedSet();

  stats.innerHTML = `
    <div class="departments-v2-stat-box"><strong>${deps.length}</strong><span>Aktif Departman</span></div>
    <div class="departments-v2-stat-box"><strong>${users.length}</strong><span>Toplam Üye</span></div>
  `;

  rows.innerHTML = deps
    .map(([name, members]) => {
      const memberCards = members
        .map((m) => {
          const full = getUserFullName(m);
          const photo = getUserPhotoById(m.id);
          const av = photo
            ? `<img src="${photo}" alt="${full}" />`
            : getUserInitials(m);
          const role = getRoleLabel(String(m.rol || "").toUpperCase());
          const canMail = !isSameUser(m, currentUser);
          const mailBtn = canMail
            ? `<button type="button" class="departments-v2-mail-btn" data-action="dept-mail" data-user-id="${String(m.id)}" title="Mesaj gönder">✉</button>`
            : "";
          return `<article class="departments-v2-member-card">
            <div class="departments-v2-member-head">
              <div class="departments-v2-member-avatar">${av}</div>
              <div class="departments-v2-member-meta"><h5>${full}</h5><span>${role}</span></div>
              ${mailBtn}
            </div>
          </article>`;
        })
        .join("") || '<p class="departments-v2-empty-members">Bu departmanda henüz üye yok.</p>';
      const isExpanded = expandedSet.has(name);
      return `<section class="departments-v2-row ${isExpanded ? "expanded" : "collapsed"}" data-dept="${escapeHtmlAttr(name)}">
        <div class="departments-v2-row-head" data-toggle-dept="${escapeHtmlAttr(name)}">
          <div class="departments-v2-row-title-wrap">
            <div class="departments-v2-row-icon">▤</div>
            <div><h3>${name}</h3><p>${members.length} kişilik ekip</p></div>
          </div>
          <div class="departments-v2-row-meta">
            <span class="departments-v2-row-count">${members.length} üye</span>
            <span class="departments-v2-row-arrow">▾</span>
          </div>
        </div>
        <div class="departments-v2-members-grid">${memberCards}</div>
      </section>`;
    })
    .join("");

  rows.querySelectorAll("[data-toggle-dept]").forEach((head) => {
    head.onclick = () => {
      const row = head.closest(".departments-v2-row");
      const deptName = head.getAttribute("data-toggle-dept");
      if (!row || !deptName) return;
      const set = getDeptExpandedSet();
      if (row.classList.contains("expanded")) {
        row.classList.remove("expanded");
        row.classList.add("collapsed");
        set.delete(deptName);
      } else {
        row.classList.add("expanded");
        row.classList.remove("collapsed");
        set.add(deptName);
      }
      saveDeptExpandedSet(set);
    };
  });

  if (addBtn && !addBtn.dataset.bound) {
    addBtn.dataset.bound = "1";
    addBtn.onclick = () => openDepartmentAddModal();
  }
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "1";
    searchInput.oninput = () => renderDepartments();
  }

  if (!rows.dataset.deptMailBound) {
    rows.dataset.deptMailBound = "1";
    rows.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action='dept-mail']");
      if (!btn) return;
      e.stopPropagation();
      const user = users.find((u) => String(u.id) === String(btn.getAttribute("data-user-id")));
      if (user) await openMessagesWithUser(user);
    });
  }
}

function openDepartmentAddModal() {
  const modal = document.getElementById("departmentAddModal");
  const input = document.getElementById("departmentAddName");
  const err = document.getElementById("departmentAddError");
  if (!modal) return;
  if (input) input.value = "";
  if (err) err.textContent = "";
  modal.classList.remove("hidden");
}

function closeDepartmentAddModalFn() {
  const modal = document.getElementById("departmentAddModal");
  if (modal) modal.classList.add("hidden");
}

async function handleDepartmentAddConfirm() {
  const input = document.getElementById("departmentAddName");
  const err = document.getElementById("departmentAddError");
  const name = String(input?.value || "").trim();
  if (!name) {
    if (err) err.textContent = "Departman adı zorunludur.";
    return;
  }
  const exists = departmentNames.some((d) => d.toLowerCase() === name.toLowerCase()) ||
    users.some((u) => String(u.departman || "").toLowerCase() === name.toLowerCase());
  if (exists) {
    if (err) err.textContent = "Bu departman zaten mevcut.";
    return;
  }
  departmentNames.push(name);
  const result = await window.api.saveDepartments(departmentNames);
  if (!result?.ok) {
    if (err) err.textContent = result?.error || "Kaydedilemedi.";
    return;
  }
  closeDepartmentAddModalFn();
  populateDepartmentSelects(name);
  renderDepartments();
}

function renderUsers() {
  const tbody = document.getElementById("usersTableBody");
  const tabs = document.getElementById("usersRoleTabs");
  const addBtn = document.querySelector(".users-v2-add-btn");
  const totalEl = document.getElementById("usersTotalCount");
  const rangeEl = document.getElementById("usersRangeInfo");
  const paginationEl = document.getElementById("usersPagination");
  if (!tbody || !tabs || !totalEl || !rangeEl || !paginationEl) return;

  const roleClassMap = { MANAGER: "mudur", LEADER: "lider", ADMIN: "personel", STAJYER: "stajyer", DEV: "dev" };
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
        const userPhoto = getUserPhotoById(user.id);
        return `
        <tr>
          <td><div class="users-v2-person"><div class="users-v2-avatar">${userPhoto ? `<img src="${userPhoto}" alt="${full}" />` : initials}</div><div><strong>${full}</strong><small>Kullanici ID: #${user.id || "-"}</small></div></div></td>
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
    if (action === "mail") openMessagesWithUser(user);
  };

  if (addBtn) addBtn.onclick = () => openUserCreateModal();
}

function openUserCreateModal() {
  populateDepartmentSelects();
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
  populateDepartmentSelects(user?.departman || "");
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
    updateSidebarUserMeta();
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
  const legacyAbout = String(localStorage.getItem(aboutKey) || "").trim();
  const fallbackAbout =
    "Yazilim gelistirme sureclerine merakli, ogrenmeye acik ve ekip calismasina yatkin bir stajyerim. Modern web teknolojileri ve surdurulebilir kod mimarileri uzerine kendimi gelistirmeyi hedefliyorum.";
  const displayAbout = String(currentUser.hakkimda || "").trim() || legacyAbout || fallbackAbout;
  const map = {
    profileFullName: getUserFullName(currentUser),
    profileTitle: getSidebarRoleText(currentUser),
    profileDepartmentBadge: currentUser.departman || "-",
    profileInfoEmail: currentUser.email || "-",
    profilePhone: currentUser.telefon || "***",
    profileAboutText: displayAbout,
    profileWorkHours: currentUser.calismaSaati || "09:00 - 18:00"
  };
  Object.entries(map).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
  const renderAvatar = () => {
    if (!profileAvatarEl) return;
    const photo = getUserPhotoById(currentUser.id) || currentUser?.profilFoto;
    if (photo) {
      profileAvatarEl.classList.add("has-photo");
      profileAvatarEl.innerHTML = `<img src="${photo}" alt="Profil" class="profile-v2-photo-img" />`;
    } else {
      profileAvatarEl.classList.remove("has-photo");
      profileAvatarEl.textContent = getUserInitials(currentUser);
    }
  };
  renderAvatar();
  bindProfileCustomization();

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

  if (!String(currentUser.hakkimda || "").trim() && legacyAbout) {
    currentUser.hakkimda = legacyAbout;
    syncUserSave()
      .then(() => localStorage.removeItem(aboutKey))
      .catch(() => {});
  }

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
      aboutInput.value = String(aboutEl.textContent || displayAbout).trim();
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

  const saveAbout = async () => {
    const value = String(aboutInput?.value || "").trim();
    const toStore = value || fallbackAbout;
    currentUser.hakkimda = toStore;
    localStorage.setItem("currentUser", JSON.stringify(currentUser));
    if (aboutEl) aboutEl.textContent = toStore;
    setAboutMode(false);
    try {
      await syncUserSave();
      localStorage.removeItem(aboutKey);
    } catch (error) {
      if (photoErrorEl) photoErrorEl.textContent = error?.message || "Hakkımda metni kaydedilemedi.";
    }
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
  syncTaskUsersHiddenInput();
  const title = document.getElementById("taskTitle")?.value.trim() || "";
  const description = document.getElementById("taskDescription")?.value.trim() || "";
  const priority = document.getElementById("taskPriority")?.value || "Dusuk";
  const startMode = document.getElementById("taskStartMode")?.value || "accepted";
  const dueDate = document.getElementById("taskDueDate")?.value || "";
  const attachment = document.getElementById("taskAttachment")?.value?.trim() || "";
  const category = document.getElementById("taskCategory")?.value || "Genel";
  const estimatedHoursRaw = document.getElementById("taskEstimatedHours")?.value;
  const estimatedHours = estimatedHoursRaw ? Number(estimatedHoursRaw) : null;
  const assigneeIdList = [...taskSelectedAssigneeIds];
  if (!assigneeIdList.length || !title || !description) {
    taskModalError.textContent = "En az bir stajyer/.dev seçin; başlık ve açıklama zorunludur.";
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate && dueDate < today) {
    taskModalError.textContent = "Geçmiş bir tarih seçilemez.";
    return;
  }
  const baseId = String(Date.now());
  const assignerName = getUserFullName(currentUser);
  for (const assigneeId of assigneeIdList) {
    const intern = users.find((u) => String(u.id) === String(assigneeId));
    if (!intern) continue;
    requests.unshift({
      id: `${baseId}-${assigneeId}`,
      requestKind: "assignment",
      title,
      description,
      sender: assignerName,
      senderId: String(currentUser.id),
      assignerId: String(currentUser.id),
      assignerName,
      assigneeId: String(assigneeId),
      assigneeName: getUserFullName(intern),
      department: intern.departman || currentUser.departman || "-",
      priority,
      dueDate: dueDate || "",
      startMode,
      attachment,
      category,
      estimatedHours: estimatedHours && estimatedHours > 0 ? estimatedHours : null,
      assignees: String(assigneeId),
      status: "Yanit Bekliyor",
      createdAt: new Date().toISOString()
    });
  }
  requests = sortRequestsQueuedFirst(requests);
  await window.api.saveRequests(requests);
  closeTaskModalFn();
  if (activeViewKey === "gelen-talepler") renderRequests();
}

function syncTaskUsersHiddenInput() {
  const hidden = document.getElementById("taskUsers");
  const names = [...taskSelectedAssigneeIds]
    .map((id) => {
      const u = users.find((x) => String(x.id) === String(id));
      return u ? getUserFullName(u) : "";
    })
    .filter(Boolean);
  if (hidden) hidden.value = names.join(", ");
}

function renderTaskAssigneePicker() {
  const picker = document.getElementById("taskAssigneePicker");
  if (!picker) return;
  const assignees = users.filter(isTaskAssigneeRole);
  picker.innerHTML = assignees.length
    ? assignees
        .map((u) => {
          const id = String(u.id);
          const selected = taskSelectedAssigneeIds.has(id);
          const photo = getUserPhotoById(u.id);
          const av = photo
            ? `<img src="${photo}" alt="" />`
            : `<span class="task-assignee-avatar">${getUserInitials(u)}</span>`;
          return `<div class="task-assignee-card ${selected ? "selected" : ""}" data-user-id="${id}" role="button" tabindex="0">${av}<strong>${getUserFullName(u)}</strong><small>${getRoleLabel(String(u.rol || "").toUpperCase())}</small></div>`;
        })
        .join("")
    : '<p class="task-assignee-empty">Stajyer veya .dev rolünde kullanıcı yok.</p>';

  picker.querySelectorAll("[data-user-id]").forEach((card) => {
    card.onclick = () => {
      const id = card.getAttribute("data-user-id");
      if (taskSelectedAssigneeIds.has(id)) taskSelectedAssigneeIds.delete(id);
      else taskSelectedAssigneeIds.add(id);
      syncTaskUsersHiddenInput();
      renderTaskAssigneePicker();
    };
  });
}

function initTaskFileUpload() {
  const drop = document.getElementById("taskFileDropZone");
  const input = document.getElementById("taskFileInput");
  const browse = document.getElementById("taskFileBrowseBtn");
  const list = document.getElementById("taskFileList");
  const hidden = document.getElementById("taskAttachment");
  if (!drop || !input || !list) return;

  const renderList = () => {
    list.innerHTML = taskAttachedFiles
      .map(
        (f, i) => `<li class="task-file-item"><span>${f.name} (${Math.round(f.size / 1024)} KB)</span><button type="button" data-remove-file="${i}" class="btn-ghost">✕</button></li>`
      )
      .join("");
    list.querySelectorAll("[data-remove-file]").forEach((btn) => {
      btn.onclick = () => {
        taskAttachedFiles.splice(Number(btn.getAttribute("data-remove-file")), 1);
        renderList();
        if (hidden) hidden.value = taskAttachedFiles.map((f) => f.name).join(", ");
      };
    });
    if (hidden) hidden.value = taskAttachedFiles.map((f) => f.name).join(", ");
  };

  const addFiles = (fileList) => {
    for (const file of fileList) {
      if (file.size > 25 * 1024 * 1024) continue;
      taskAttachedFiles.push(file);
    }
    renderList();
  };

  if (!drop.dataset.bound) {
    drop.dataset.bound = "1";
    browse?.addEventListener("click", (e) => {
      e.preventDefault();
      input.click();
    });
    drop.addEventListener("click", (e) => {
      if (e.target === browse) return;
      input.click();
    });
    input.addEventListener("change", () => {
      addFiles(input.files || []);
      input.value = "";
    });
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("drag-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("drag-over");
      addFiles(e.dataTransfer?.files || []);
    });
  }
  renderList();
}

function openTaskModal() {
  if (!taskModal) return;
  taskModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  taskSelectedAssigneeIds = new Set();
  taskAttachedFiles = [];
  resetTaskDatePicker();
  renderTaskAssigneePicker();
  initTaskFileUpload();
  initTaskDatePicker();
  syncTaskUsersHiddenInput();
}

function closeTaskModalFn() {
  if (!taskModal) return;
  taskModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  if (taskCreateForm) taskCreateForm.reset();
  if (taskModalError) taskModalError.textContent = "";
  taskSelectedAssigneeIds = new Set();
  taskAttachedFiles = [];
  resetTaskDatePicker();
}

function toggleAppTheme() {
  const isLight = localStorage.getItem("appTheme") === "light";
  localStorage.setItem("appTheme", isLight ? "dark" : "light");
  applyThemeFromStorage();
}

function bindShellEvents() {
  navLinks.forEach((btn) => {
    btn.addEventListener("click", async () => {
      navLinks.forEach((item) => item.classList.remove("active"));
      btn.classList.add("active");
      localStorage.setItem(LAST_ACTIVE_VIEW_KEY, btn.dataset.view);
      await loadView(btn.dataset.view);
    });
  });

  const sidebarNewTaskBtn = document.getElementById("sidebarNewTaskBtn");
  if (sidebarNewTaskBtn) {
    sidebarNewTaskBtn.addEventListener("click", () => {
      if (canAccessStaffFeatures()) openTaskModal();
    });
  }

  const sidebarSettingsBtn = document.getElementById("sidebarSettingsBtn");
  if (sidebarSettingsBtn) {
    sidebarSettingsBtn.addEventListener("click", async () => {
      if (!canAccessStaffFeatures()) return;
      navLinks.forEach((item) => item.classList.remove("active"));
      localStorage.setItem(LAST_ACTIVE_VIEW_KEY, "erisim-ayarlari");
      await loadView("erisim-ayarlari");
    });
  }

  const sidebarThemeBtn = document.getElementById("sidebarThemeBtn");
  const topbarThemeBtn = document.getElementById("topbarThemeBtn");
  if (sidebarThemeBtn) sidebarThemeBtn.addEventListener("click", toggleAppTheme);
  if (topbarThemeBtn) topbarThemeBtn.addEventListener("click", toggleAppTheme);

  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener("click", () => {
      appShell.classList.toggle("sidebar-hidden");
      localStorage.setItem("sidebarHidden", appShell.classList.contains("sidebar-hidden") ? "1" : "0");
    });
  }
  if (localStorage.getItem("sidebarHidden") === "1") {
    appShell.classList.add("sidebar-hidden");
  }

  if (toggleSidebarBtn) toggleSidebarBtn.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    appShell.classList.toggle("collapsed");
  });

  const taskAssignAllBtn = document.getElementById("taskAssignAllBtn");
  if (taskAssignAllBtn) {
    taskAssignAllBtn.addEventListener("click", () => {
      users.filter(isTaskAssigneeRole).forEach((u) => taskSelectedAssigneeIds.add(String(u.id)));
      syncTaskUsersHiddenInput();
      renderTaskAssigneePicker();
    });
  }

  const cancelRequestQueue = document.getElementById("cancelRequestQueue");
  const confirmRequestQueue = document.getElementById("confirmRequestQueue");
  if (cancelRequestQueue) cancelRequestQueue.addEventListener("click", closeRequestQueueModalFn);
  if (confirmRequestQueue) confirmRequestQueue.addEventListener("click", handleRequestQueueConfirm);

  const cancelDepartmentAdd = document.getElementById("cancelDepartmentAdd");
  const confirmDepartmentAdd = document.getElementById("confirmDepartmentAdd");
  if (cancelDepartmentAdd) cancelDepartmentAdd.addEventListener("click", closeDepartmentAddModalFn);
  if (confirmDepartmentAdd) confirmDepartmentAdd.addEventListener("click", handleDepartmentAddConfirm);

  if (logoutBtn) logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("currentUser");
    window.location.href = "./login.html";
  });

  if (openTaskCreate) {
    openTaskCreate.addEventListener("click", () => {
      if (canAccessStaffFeatures()) openTaskModal();
    });
  }
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

  const cancelRequestReject = document.getElementById("cancelRequestReject");
  const confirmRequestReject = document.getElementById("confirmRequestReject");
  const requestRejectConfirmCheck = document.getElementById("requestRejectConfirmCheck");
  const requestRejectModal = document.getElementById("requestRejectModal");
  if (cancelRequestReject) cancelRequestReject.addEventListener("click", closeRequestRejectModalFn);
  if (requestRejectModal) {
    requestRejectModal.addEventListener("click", (e) => e.target === requestRejectModal && closeRequestRejectModalFn());
  }
  if (requestRejectConfirmCheck && confirmRequestReject) {
    requestRejectConfirmCheck.addEventListener("change", () => {
      confirmRequestReject.disabled = !requestRejectConfirmCheck.checked;
    });
  }
  if (confirmRequestReject) confirmRequestReject.addEventListener("click", handleRequestRejectConfirm);

  const taskCompleteForm = document.getElementById("taskCompleteForm");
  const closeTaskCompleteModal = document.getElementById("closeTaskCompleteModal");
  const cancelTaskComplete = document.getElementById("cancelTaskComplete");
  const taskCompleteModal = document.getElementById("taskCompleteModal");
  if (taskCompleteForm) taskCompleteForm.addEventListener("submit", handleTaskCompleteSubmit);
  if (closeTaskCompleteModal) closeTaskCompleteModal.addEventListener("click", closeTaskCompleteModalFn);
  if (cancelTaskComplete) cancelTaskComplete.addEventListener("click", closeTaskCompleteModalFn);
  if (taskCompleteModal) {
    taskCompleteModal.addEventListener("click", (e) => e.target === taskCompleteModal && closeTaskCompleteModalFn());
  }

  const taskPostponeForm = document.getElementById("taskPostponeForm");
  const closeTaskPostponeModal = document.getElementById("closeTaskPostponeModal");
  const cancelTaskPostpone = document.getElementById("cancelTaskPostpone");
  const taskPostponeModal = document.getElementById("taskPostponeModal");
  if (taskPostponeForm) taskPostponeForm.addEventListener("submit", handleTaskPostponeSubmit);
  if (closeTaskPostponeModal) closeTaskPostponeModal.addEventListener("click", closeTaskPostponeModalFn);
  if (cancelTaskPostpone) cancelTaskPostpone.addEventListener("click", closeTaskPostponeModalFn);
  if (taskPostponeModal) {
    taskPostponeModal.addEventListener("click", (e) => e.target === taskPostponeModal && closeTaskPostponeModalFn());
  }

  const taskEvalForm = document.getElementById("taskEvalForm");
  const cancelTaskEval = document.getElementById("cancelTaskEval");
  const taskEvalModal = document.getElementById("taskEvalModal");
  if (taskEvalForm) taskEvalForm.addEventListener("submit", handleTaskEvalSubmit);
  if (cancelTaskEval) cancelTaskEval.addEventListener("click", closeTaskEvalModalFn);
  if (taskEvalModal) {
    taskEvalModal.addEventListener("click", (e) => e.target === taskEvalModal && closeTaskEvalModalFn());
  }
}

async function init() {
  applyThemeFromStorage();
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
        updateSidebarUserMeta();
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
  populateDepartmentSelects();
  const savedView = localStorage.getItem(LAST_ACTIVE_VIEW_KEY);
  let validView = navLinks.some((btn) => btn.dataset.view === savedView && !btn.classList.contains("nav-link-hidden"));
  let initialView = validView ? savedView : "gorevlerim";
  if (isViewBlockedForUser(initialView)) initialView = "gorevlerim";
  navLinks.forEach((item) => item.classList.remove("active"));
  const initialBtn = navLinks.find((btn) => btn.dataset.view === initialView);
  if (initialBtn) initialBtn.classList.add("active");
  await loadView(initialView);

  const urlParams = new URLSearchParams(window.location.search);
  const postponeTaskId = urlParams.get("postpone");
  if (postponeTaskId) {
    const postponeTask = tasks.find((t) => String(t.taskId) === String(postponeTaskId));
    if (postponeTask) {
      window.history.replaceState({}, "", "./app.html");
      openTaskPostponeModal(postponeTask);
    }
  }
}

init();
