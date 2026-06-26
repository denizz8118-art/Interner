/**
 * Görev çalışma alanı — paylaşılan yardımcılar (app.js + gorev-calisma.js).
 */
(function (root) {
  const ACTIVE_STATUSES = new Set(["devam eden", "devam ediyor", "açıldı", "acildi", "kabul edildi"]);

  function taskBelongsToUser(task, userId) {
    const id = String(userId ?? "");
    if (!id) return false;
    const assignees = String(task?.assignees || "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return assignees.includes(id);
  }

  function normalizeStatus(status) {
    return String(status || "").trim().toLowerCase();
  }

  function isActiveTask(task) {
    const s = normalizeStatus(task?.status);
    return ACTIVE_STATUSES.has(s) || s.includes("devam") || s === "ara verilen";
  }

  function defaultChecklist(task) {
    const cat = String(task?.category || "Genel");
    const base = [
      { id: "c1", label: "Görev gereksinimlerini oku ve anla", done: false },
      { id: "c2", label: "Çalışma planını ve teslim formatını netleştir", done: false },
      { id: "c3", label: "Ana çıktıyı oluştur (kod / doküman / analiz)", done: false },
      { id: "c4", label: "Kendi kontrol listenden geç (kalite)", done: false },
      { id: "c5", label: "Teslim bağlantısı veya dosyayı hazırla", done: false }
    ];
    if (cat === "Geliştirme") {
      base.splice(2, 0, { id: "c2b", label: "Yerel ortamda test et", done: false });
    }
    return base;
  }

  function ensureWorkspaceFields(task) {
    if (!Array.isArray(task.workChecklist) || !task.workChecklist.length) {
      task.workChecklist = defaultChecklist(task);
    }
    if (!Array.isArray(task.workLog)) task.workLog = [];
    if (typeof task.workNotes !== "string") task.workNotes = "";
    return task;
  }

  function calcChecklistProgress(task) {
    const list = task?.workChecklist || [];
    if (!list.length) return 0;
    const done = list.filter((c) => c.done).length;
    return Math.round((done / list.length) * 100);
  }

  function calcInternSuccessStats(allTasks, userId) {
    const mine = (allTasks || []).filter((t) => taskBelongsToUser(t, userId));
    const total = mine.length;
    const completed = mine.filter((t) => normalizeStatus(t.status) === "tamamlanan").length;
    const active = mine.filter((t) => isActiveTask(t)).length;
    const failed = mine.filter((t) => normalizeStatus(t.status).includes("başarısız") || normalizeStatus(t.status).includes("basarisiz")).length;
    const onTime = mine.filter((t) => {
      if (normalizeStatus(t.status) !== "tamamlanan" || !t.dueDate || !t.completedAt) return false;
      return String(t.completedAt).slice(0, 10) <= String(t.dueDate).slice(0, 10);
    }).length;
    const rate = total ? Math.round((completed / total) * 100) : 0;
    const onTimeRate = completed ? Math.round((onTime / completed) * 100) : 0;
    return { total, completed, active, failed, rate, onTimeRate, mine };
  }

  function appendWorkLog(task, action, text) {
    ensureWorkspaceFields(task);
    task.workLog.unshift({
      at: new Date().toISOString(),
      action,
      text: String(text || "").trim()
    });
    if (task.workLog.length > 50) task.workLog.length = 50;
  }

  root.TaskWorkspace = {
    ACTIVE_STATUSES,
    taskBelongsToUser,
    normalizeStatus,
    isActiveTask,
    defaultChecklist,
    ensureWorkspaceFields,
    calcChecklistProgress,
    calcInternSuccessStats,
    appendWorkLog
  };
})(typeof window !== "undefined" ? window : globalThis);
