/* global TaskWorkspace */
(() => {
  const TW = window.TaskWorkspace;
  let currentUser = null;
  let tasks = [];
  let users = [];
  let task = null;
  let saveTimer = null;
  let timerInterval = null;
  let sessionStartedAt = null;

  function getTaskIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("taskId") || "";
  }

  function ensureSession() {
    try {
      currentUser = JSON.parse(localStorage.getItem("currentUser") || "null");
    } catch {
      currentUser = null;
    }
    if (!currentUser?.id) {
      window.location.href = "./login.html";
      return false;
    }
    return true;
  }

  function applyTheme() {
    const theme = localStorage.getItem("appTheme") || "dark";
    document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
  }

  function formatDate(d) {
    if (!d) return "Belirtilmedi";
    try {
      return new Date(d).toLocaleDateString("tr-TR");
    } catch {
      return String(d);
    }
  }

  function findUserById(id) {
    return users.find((u) => String(u.id) === String(id));
  }

  function getUserName(u) {
    if (!u) return "-";
    return String(u.ad_soyad || `${u.ad || ""} ${u.soyad || ""}`.trim() || "-");
  }

  function resolveAssigner(t) {
    const byId = findUserById(t?.senderId);
    if (byId) return { id: byId.id, name: getUserName(byId) };
    return { id: t?.senderId || "", name: t?.sender || "Mentor" };
  }

  function isBusinessDay(d) {
    const day = d.getDay();
    return day !== 0 && day !== 6;
  }

  function businessDaysBetween(startDate) {
    if (!startDate) return 0;
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

  async function persistTasks() {
    const result = await window.api.saveTasks(tasks);
    if (!result?.ok) throw new Error(result?.error || "Görev kaydedilemedi.");
  }

  function updateProgressUI() {
    const pct = TW.calcChecklistProgress(task);
    const arc = document.getElementById("taskWorkProgressArc");
    const label = document.getElementById("taskWorkProgressPct");
    const circumference = 2 * Math.PI * 52;
    if (arc) arc.setAttribute("stroke-dashoffset", String(circumference * (1 - pct / 100)));
    if (label) label.textContent = `${pct}%`;
  }

  function renderChecklist() {
    const ul = document.getElementById("taskWorkChecklist");
    if (!ul || !task) return;
    ul.innerHTML = (task.workChecklist || [])
      .map(
        (item, idx) =>
          `<li>
            <input type="checkbox" data-idx="${idx}" ${item.done ? "checked" : ""} />
            <span>${escapeHtml(item.label)}</span>
          </li>`
      )
      .join("");
    ul.onchange = async (e) => {
      const cb = e.target.closest('input[type="checkbox"]');
      if (!cb) return;
      const idx = Number(cb.dataset.idx);
      if (!task.workChecklist[idx]) return;
      task.workChecklist[idx].done = cb.checked;
      TW.appendWorkLog(task, cb.checked ? "checklist_done" : "checklist_undone", task.workChecklist[idx].label);
      updateProgressUI();
      renderLog();
      scheduleSave();
    };
  }

  function renderLog() {
    const el = document.getElementById("taskWorkLog");
    if (!el || !task) return;
    const logs = task.workLog || [];
    el.innerHTML = logs.length
      ? logs
          .slice(0, 12)
          .map(
            (l) =>
              `<div class="task-work-log-item"><time>${new Date(l.at).toLocaleString("tr-TR")}</time> — ${escapeHtml(l.text || l.action)}</div>`
          )
          .join("")
      : "<p>Henüz aktivite yok.</p>";
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function scheduleSave() {
    const hint = document.getElementById("taskWorkSaveHint");
    if (hint) hint.textContent = "Kaydediliyor…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await persistTasks();
        if (hint) hint.textContent = "Otomatik kaydedildi · " + new Date().toLocaleTimeString("tr-TR");
      } catch (err) {
        if (hint) hint.textContent = err?.message || "Kayıt hatası";
      }
    }, 600);
  }

  function startSessionTimer() {
    sessionStartedAt = task.workSessionStartedAt ? new Date(task.workSessionStartedAt) : new Date();
    if (!task.workSessionStartedAt) {
      task.workSessionStartedAt = sessionStartedAt.toISOString();
    }
    const el = document.getElementById("taskWorkTimer");
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const base = task.workStartedAt ? new Date(task.workStartedAt).getTime() : sessionStartedAt.getTime();
      const sec = Math.max(0, Math.floor((Date.now() - base) / 1000));
      const h = String(Math.floor(sec / 3600)).padStart(2, "0");
      const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
      const s = String(sec % 60).padStart(2, "0");
      if (el) el.textContent = `${h}:${m}:${s}`;
    }, 1000);
  }

  function renderTaskUI() {
    TW.ensureWorkspaceFields(task);
    const assigner = resolveAssigner(task);
    document.getElementById("taskWorkTitle").textContent = task.title || "Görev";
    document.getElementById("taskWorkSubtitle").textContent = `${task.department || "-"} · ${task.priority || "Orta"}`;
    document.getElementById("taskWorkDesc").textContent = task.description || "—";
    document.getElementById("taskWorkPriority").textContent = task.priority || "—";
    document.getElementById("taskWorkDue").textContent = formatDate(task.dueDate);
    document.getElementById("taskWorkMentor").textContent = assigner.name;
    document.getElementById("taskWorkCategory").textContent = task.category || "Genel";
    document.getElementById("taskWorkStatus").textContent = task.status || "—";
    document.getElementById("taskWorkBusinessDays").textContent = String(businessDaysBetween(task.workStartedAt || task.acceptedAt));
    const notes = document.getElementById("taskWorkNotes");
    if (notes && notes.value !== task.workNotes) notes.value = task.workNotes || "";
    renderChecklist();
    updateProgressUI();
    renderLog();
    startSessionTimer();
  }

  async function beginWorkSession(resumedFromPause = false) {
    const wasActive = TW.normalizeStatus(task.status).includes("devam");
    if (!task.workStartedAt) task.workStartedAt = new Date().toISOString();
    if (resumedFromPause) {
      TW.appendWorkLog(task, "resume", "Ara vermeden sonra devam edildi");
    } else if (!wasActive || TW.normalizeStatus(task.status) === "devam eden") {
      task.status = "Devam Ediyor";
      TW.appendWorkLog(task, "session_start", "Görev çalışma alanına girildi");
    }
    await persistTasks();
    renderTaskUI();
  }

  async function handlePause() {
    const reason = window.prompt("Ara verme sebebi (zorunlu):", "");
    if (!reason?.trim()) return;
    task.status = "Ara Verilen";
    task.pauseReason = reason.trim();
    TW.appendWorkLog(task, "pause", reason.trim());
    await persistTasks();
    window.location.href = "./app.html";
  }

  async function handlePostpone() {
    window.location.href = `./app.html?postpone=${encodeURIComponent(task.taskId)}`;
  }

  async function submitCompletion() {
    const err = document.getElementById("taskWorkError");
    if (err) err.textContent = "";
    const link = document.getElementById("taskWorkLink")?.value.trim() || "";
    const note = document.getElementById("taskWorkCompleteNote")?.value.trim() || "";
    const files = document.getElementById("taskWorkFiles")?.value.trim() || "";
    if (!link && !note && !files) {
      if (err) err.textContent = "En az bağlantı, not veya dosya adı girin.";
      return;
    }
    const assigner = resolveAssigner(task);
    if (!assigner.id) {
      if (err) err.textContent = "Görevi atayan kişi bulunamadı.";
      return;
    }
    const allRequests = await window.api.listRequests();
    const requests = Array.isArray(allRequests) ? allRequests : [];
    const description = [
      `Görev: ${task.title || "-"}`,
      `Çözüm bağlantısı: ${link || "-"}`,
      `Stajyer notu: ${note || "-"}`,
      files ? `Dosyalar: ${files}` : "",
      `Checklist ilerleme: %${TW.calcChecklistProgress(task)}`
    ].join("\n");
    requests.unshift({
      id: String(Date.now()),
      requestKind: "completion",
      title: `[Tamamlama] ${task.title || "Görev"}`,
      description,
      sender: getUserName(currentUser),
      senderId: currentUser.id,
      assignerId: assigner.id,
      assignerName: assigner.name,
      relatedTaskId: task.taskId || "",
      department: currentUser.departman || task.department || "-",
      priority: task.priority || "Orta",
      dueDate: task.dueDate || "",
      solutionLink: link,
      internNote: note,
      attachment: files,
      status: "Yanit Bekliyor",
      createdAt: new Date().toISOString()
    });
    task.submittedAt = new Date().toISOString();
    task.workNotes = document.getElementById("taskWorkNotes")?.value || task.workNotes;
    TW.appendWorkLog(task, "submitted", "Tamamlama talebi gönderildi");
    const reqResult = await window.api.saveRequests(requests);
    if (!reqResult?.ok) {
      if (err) err.textContent = reqResult?.error || "Talep kaydedilemedi.";
      return;
    }
    await persistTasks();
    window.location.href = "./app.html";
  }

  function bindEvents() {
    document.getElementById("taskWorkBack")?.addEventListener("click", async () => {
      task.workNotes = document.getElementById("taskWorkNotes")?.value || "";
      try {
        await persistTasks();
      } catch (_e) {
        /* ignore */
      }
      window.location.href = "./app.html";
    });
    document.getElementById("taskWorkNotes")?.addEventListener("input", () => {
      task.workNotes = document.getElementById("taskWorkNotes").value;
      scheduleSave();
    });
    document.getElementById("taskWorkBtnPause")?.addEventListener("click", handlePause);
    document.getElementById("taskWorkBtnPostpone")?.addEventListener("click", handlePostpone);
    document.getElementById("taskWorkBtnComplete")?.addEventListener("click", () => {
      document.getElementById("taskWorkCompletePanel")?.classList.remove("hidden");
      document.getElementById("taskWorkCompletePanel")?.scrollIntoView({ behavior: "smooth" });
    });
    document.getElementById("taskWorkSubmitComplete")?.addEventListener("click", submitCompletion);
  }

  async function init() {
    applyTheme();
    if (!ensureSession()) return;
    const taskId = getTaskIdFromUrl();
    if (!taskId) {
      window.location.href = "./app.html";
      return;
    }
    const [taskList, userList] = await Promise.all([window.api.listTasks(), window.api.listUsers()]);
    tasks = Array.isArray(taskList) ? taskList : [];
    users = Array.isArray(userList) ? userList : [];
    task = tasks.find((t) => String(t.taskId) === String(taskId));
    if (!task) {
      alert("Görev bulunamadı.");
      window.location.href = "./app.html";
      return;
    }
    const role = String(currentUser.rol || "").toUpperCase();
    if (role === "STAJYER" && !TW.taskBelongsToUser(task, currentUser.id)) {
      alert("Bu göreve erişim yetkiniz yok.");
      window.location.href = "./app.html";
      return;
    }
    const terminal = ["tamamlanan", "başarısız", "basarisiz", "iptal edilen"];
    if (terminal.includes(TW.normalizeStatus(task.status))) {
      alert("Bu görev zaten kapatılmış.");
      window.location.href = "./app.html";
      return;
    }
    let resumedFromPause = false;
    if (TW.normalizeStatus(task.status) === "ara verilen") {
      task.status = "Devam Ediyor";
      delete task.pauseReason;
      resumedFromPause = true;
    }
    bindEvents();
    await beginWorkSession(resumedFromPause);
  }

  init();
})();
