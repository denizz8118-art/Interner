(() => {
  let ctx = null;
  let selectedInternId = "";
  let activeDetailTab = "executive";
  let activeDeptFilter = "ALL";
  let activeWeekFilter = "";
  let activeCategoryFilter = "ALL";

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getStajyers() {
    const all = (ctx?.users || []).filter((u) => String(u.rol || "").toUpperCase() === "STAJYER");
    const me = ctx?.currentUser;
    if (!me || ctx?.hasFullAccess?.(me)) return all;
    const dept = String(me.departman || "").trim();
    if (!dept) return all;
    return all.filter((u) => String(u.departman || "").trim() === dept || !String(u.departman || "").trim());
  }

  function getPortfolio(internId) {
    return (ctx?.portfolios || []).find((p) => String(p.internId) === String(internId)) || { internId: String(internId) };
  }

  function buildUsersById() {
    const map = {};
    (ctx?.users || []).forEach((u) => {
      map[String(u.id)] = u;
    });
    return map;
  }

  function getAnalyzeOptions() {
    const opts = { usersById: buildUsersById() };
    if (activeWeekFilter) opts.weeks = Number(activeWeekFilter);
    if (activeCategoryFilter && activeCategoryFilter !== "ALL") opts.category = activeCategoryFilter;
    return opts;
  }

  function analyze(intern) {
    return window.InternScore.analyzeIntern(intern, ctx?.tasks || [], getPortfolio(intern.id), getAnalyzeOptions());
  }

  function taskBelongsToIntern(task, internId) {
    const id = String(internId);
    const assignees = String(task?.assignees || "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return assignees.includes(id) || String(task?.senderId || "") === id;
  }

  function getInternTasks(internId) {
    return (ctx?.tasks || []).filter((t) => taskBelongsToIntern(t, internId));
  }

  function countActiveTasks(internId) {
    return getInternTasks(internId).filter((t) => {
      const s = String(t.status || "").toLowerCase();
      return s === "devam eden" || (!s.includes("tamamlanan") && !s.includes("başarısız") && !s.includes("iptal"));
    }).length;
  }

  function getTenureLabel(intern) {
    const tasks = getInternTasks(intern.id);
    const dates = tasks
      .map((t) => t.acceptedAt || t.createdAt)
      .filter(Boolean)
      .map((d) => new Date(d))
      .filter((d) => !Number.isNaN(d.getTime()));
    if (!dates.length) return "Yeni";
    const start = new Date(Math.min(...dates.map((d) => d.getTime())));
    const days = Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86400000));
    if (days < 14) return `${days}. Gün`;
    if (days < 60) return `${Math.ceil(days / 7)}. Hafta`;
    return `${Math.ceil(days / 30)}. Ay`;
  }

  function getActivitySubtitle(intern, analysis) {
    const active = getInternTasks(intern.id).filter((t) => String(t.status || "").toLowerCase().includes("devam"));
    if (active.length && active[0].title) return active[0].title;
    if (analysis.metrics.completedCount > 0) return `${analysis.metrics.completedCount} görev tamamlandı · InternScore ${analysis.score}`;
    return analysis.segment.recommendation;
  }

  function statusToDotClass(tone) {
    if (tone === "success") return "success";
    if (tone === "warning" || tone === "danger") return tone === "danger" ? "danger" : "warning";
    return "neutral";
  }

  function segmentBadgeClass(tone) {
    return `segment-${tone}`;
  }

  function getDepartments(stajyers) {
    const set = new Set(stajyers.map((u) => String(u.departman || "").trim()).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, "tr"));
  }

  function renderDeptFilters(stajyers) {
    const wrap = document.getElementById("internDeptFilters");
    if (!wrap) return;
    const depts = getDepartments(stajyers);
    wrap.innerHTML =
      `<button type="button" class="intern-v2-filter ${activeDeptFilter === "ALL" ? "active" : ""}" data-dept="ALL">Hepsi</button>` +
      depts
        .map(
          (d) =>
            `<button type="button" class="intern-v2-filter ${activeDeptFilter === d ? "active" : ""}" data-dept="${escapeHtml(d)}">${escapeHtml(d)}</button>`
        )
        .join("");

    wrap.onclick = (e) => {
      const btn = e.target.closest(".intern-v2-filter");
      if (!btn) return;
      activeDeptFilter = btn.dataset.dept || "ALL";
      renderGrid();
    };
  }

  function renderRadarSvg(axes) {
    const cx = 110;
    const cy = 110;
    const maxR = 80;
    const n = axes.length;
    const angleStep = (Math.PI * 2) / n;

    let grid = "";
    [0.25, 0.5, 0.75, 1].forEach((lv) => {
      const pts = axes
        .map((_, i) => {
          const a = -Math.PI / 2 + i * angleStep;
          const r = maxR * lv;
          return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
        })
        .join(" ");
      grid += `<polygon points="${pts}" fill="none" stroke="#464555" stroke-width="1"/>`;
    });

    const dataPts = axes
      .map((ax, i) => {
        const a = -Math.PI / 2 + i * angleStep;
        const r = maxR * (Math.max(0, Math.min(100, ax.value)) / 100);
        return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
      })
      .join(" ");

    const labels = axes
      .map((ax, i) => {
        const a = -Math.PI / 2 + i * angleStep;
        const lx = cx + (maxR + 18) * Math.cos(a);
        const ly = cy + (maxR + 18) * Math.sin(a);
        return `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" fill="#918fa1" font-size="9">${escapeHtml(ax.label)}</text>`;
      })
      .join("");

    return `<svg class="intern-radar-svg" viewBox="0 0 220 220">${grid}<polygon points="${dataPts}" fill="rgba(135,129,255,0.22)" stroke="#8781ff" stroke-width="2"/>${labels}</svg>`;
  }

  function renderSuccessBars(successBars) {
    const max = Math.max(successBars.completed, successBars.failed, successBars.ongoing, 1);
    const pct = (n) => Math.max(4, Math.round((n / max) * 100));
    return `
      <div class="intern-success-bars">
        <div class="intern-success-bar-row">
          <span class="intern-success-label done">Tamamlanan</span>
          <div class="intern-success-track"><div class="intern-success-fill done" style="width:${pct(successBars.completed)}%"></div></div>
          <strong>${successBars.completed}</strong>
        </div>
        <div class="intern-success-bar-row">
          <span class="intern-success-label fail">Başarısız</span>
          <div class="intern-success-track"><div class="intern-success-fill fail" style="width:${pct(successBars.failed)}%"></div></div>
          <strong>${successBars.failed}</strong>
        </div>
        <div class="intern-success-bar-row">
          <span class="intern-success-label ongoing">Devam</span>
          <div class="intern-success-track"><div class="intern-success-fill ongoing" style="width:${pct(successBars.ongoing)}%"></div></div>
          <strong>${successBars.ongoing}</strong>
        </div>
      </div>`;
  }

  function renderScoreBreakdownTable(breakdown) {
    const rows = breakdown
      .map(
        (row) =>
          `<tr><td>${escapeHtml(row.label)}</td><td>${row.value}</td><td>${row.weightPct}%</td><td><strong>${row.contribution}</strong></td></tr>`
      )
      .join("");
    return `
      <table class="intern-score-table">
        <thead><tr><th>Bileşen</th><th>Skor</th><th>Ağırlık</th><th>Katkı</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function renderTimeline(timeline) {
    if (!timeline.length) return '<p class="intern-exec-summary">Bu filtrede görev yok.</p>';
    const minDate = timeline.reduce((m, t) => {
      const d = t.start ? new Date(t.start).getTime() : Date.now();
      return Math.min(m, d);
    }, Date.now());
    const maxDate = timeline.reduce((m, t) => {
      const d = t.end ? new Date(t.end).getTime() : t.dueDate ? new Date(t.dueDate).getTime() : Date.now();
      return Math.max(m, d);
    }, minDate);
    const span = Math.max(maxDate - minDate, 86400000);

    const rows = timeline
      .map((t) => {
        const startMs = t.start ? new Date(t.start).getTime() : minDate;
        const endMs = t.end ? new Date(t.end).getTime() : t.dueDate ? new Date(t.dueDate).getTime() : Date.now();
        const left = Math.round(((startMs - minDate) / span) * 100);
        const width = Math.max(8, Math.round(((endMs - startMs) / span) * 100));
        const lateClass = t.late ? " late" : "";
        const statusClass = t.status === "Tamamlanan" ? "done" : t.status === "Başarısız" ? "fail" : "ongoing";
        return `
          <div class="intern-timeline-row">
            <div class="intern-timeline-meta">
              <strong>${escapeHtml(t.title)}</strong>
              <span>${escapeHtml(t.category)} · ${escapeHtml(t.status)}</span>
            </div>
            <div class="intern-timeline-track">
              <div class="intern-timeline-bar ${statusClass}${lateClass}" style="left:${left}%;width:${width}%"></div>
            </div>
          </div>`;
      })
      .join("");

    return `<div class="intern-timeline">${rows}</div>`;
  }

  function renderTaskTable(timeline) {
    if (!timeline.length) return "";
    const rows = timeline
      .map((t) => {
        const dur = t.actualDurationDays != null ? `${t.actualDurationDays} gün` : "—";
        const est = t.estimatedHours != null ? `${t.estimatedHours} sa` : "—";
        const q = t.quality != null ? t.quality : "—";
        const late = t.late ? '<span class="intern-late-badge">Gecikmiş</span>' : "";
        return `<tr>
          <td>${escapeHtml(t.title)}${late}</td>
          <td>${escapeHtml(t.category)}</td>
          <td>${escapeHtml(t.status)}</td>
          <td>${dur}</td>
          <td>${est}</td>
          <td>${q}</td>
        </tr>`;
      })
      .join("");
    return `
      <table class="intern-task-table">
        <thead><tr><th>Görev</th><th>Kategori</th><th>Durum</th><th>Süre</th><th>Tahmini</th><th>Kalite</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function renderInternCard(intern, analysis) {
    const photo = ctx?.getUserPhotoById?.(intern.id) || intern.profilFoto || "";
    const initials = ctx.getUserFullName(intern).slice(0, 2).toUpperCase();
    const avInner = photo ? `<img src="${photo}" alt="" />` : escapeHtml(initials);
    const seg = analysis.segment;
    const activeTasks = countActiveTasks(intern.id);
    const dept = intern.departman || "Genel";
    const selected = String(intern.id) === selectedInternId ? " selected" : "";

    return `
      <article class="intern-v2-card${selected}" data-intern-id="${escapeHtml(intern.id)}">
        <div class="intern-v2-card-inner">
          <div class="intern-v2-avatar-wrap">
            <span class="intern-v2-score-pill">${analysis.score}</span>
            <div class="intern-v2-avatar-ring">
              <div class="intern-v2-avatar">${avInner}</div>
            </div>
            <span class="intern-v2-status ${statusToDotClass(analysis.statusTone)}"></span>
          </div>
          <h3 class="intern-v2-name">${escapeHtml(ctx.getUserFullName(intern))}</h3>
          <div class="intern-v2-badges">
            <span class="intern-v2-badge dept">${escapeHtml(dept)}</span>
            <span class="intern-v2-badge tasks">${activeTasks} Aktif Görev</span>
            <span class="intern-v2-badge ${segmentBadgeClass(seg.tone)}">${escapeHtml(seg.label)}</span>
          </div>
          <p class="intern-v2-subtitle">${escapeHtml(getActivitySubtitle(intern, analysis))}</p>
          <div class="intern-v2-card-foot">
            <span>Kıdem: ${escapeHtml(getTenureLabel(intern))}</span>
            <span class="intern-v2-mentor" title="InternScore">IS</span>
          </div>
        </div>
      </article>`;
  }

  function renderRecommendationsList(recommendations) {
    return `<ul class="intern-recommend-list">${recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`;
  }

  function renderExecutive(intern, analysis) {
    const seg = analysis.segment;
    const band = analysis.classBand;
    const flags =
      analysis.flags.length > 0
        ? `<ul class="intern-flag-list">${analysis.flags.map((f) => `<li>⚠ ${escapeHtml(f)}</li>`).join("")}</ul>`
        : '<p class="intern-exec-summary">Kritik uyarı yok — trend stabil görünüyor.</p>';

    return `
      <div class="intern-print-root" id="internPrintRoot">
        <div class="intern-exec-grid">
          <div class="intern-exec-main">
            <div class="intern-print-header">
              <h2>${escapeHtml(ctx.getUserFullName(intern))}</h2>
              <span class="intern-class-band ${band.tone}">${escapeHtml(band.label)}</span>
            </div>
            <p class="intern-exec-summary">${escapeHtml(analysis.summary)}</p>
            <div class="intern-exec-kpis">
              <div class="intern-mini-kpi"><span>Tamamlama</span><strong>%${Math.round(analysis.metrics.completionRate)}</strong></div>
              <div class="intern-mini-kpi"><span>Zamanında</span><strong>%${Math.round(analysis.metrics.onTimeRate)}</strong></div>
              <div class="intern-mini-kpi"><span>Dönüşüm tahmini</span><strong>%${analysis.finance.conversionLikelihood}</strong></div>
            </div>
            <h4 class="intern-section-title">Öneriler</h4>
            ${renderRecommendationsList(analysis.recommendations)}
            ${flags}
            <div class="intern-exec-actions">
              <button type="button" class="btn-primary intern-recommend-btn" data-action="log-hire">Full-time Öner — Kaydet</button>
              <button type="button" class="btn-ghost" data-action="print-summary">Özet Yazdır</button>
            </div>
          </div>
          <div class="intern-gauge-box">
            <div class="intern-gauge-large" style="--pct:${analysis.score}"><strong>${analysis.score}</strong></div>
            <span class="intern-segment-badge ${seg.tone}">${escapeHtml(seg.label)}</span>
            <p class="intern-exec-summary" style="margin-top:12px;font-size:13px">${escapeHtml(seg.recommendation)}</p>
            <div class="intern-print-mini-charts">
              <div class="intern-chart-card intern-print-only">
                <h4>Yetkinlik Radarı</h4>
                <div class="intern-radar-wrap">${renderRadarSvg(analysis.radar)}</div>
              </div>
              <div class="intern-chart-card intern-print-only">
                <h4>Görev Durumu</h4>
                ${renderSuccessBars(analysis.successBars)}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderPerformanceTab(_intern, analysis) {
    const maxTrend = Math.max(...analysis.trend.map((t) => t.score ?? 0), 1);
    const trendHtml = analysis.trend
      .map((t) => {
        const h = t.score != null ? Math.max(8, Math.round((t.score / maxTrend) * 100)) : 4;
        return `<div class="intern-trend-col"><div class="intern-trend-bar" style="height:${h}%"></div><span>${escapeHtml(t.label)}</span></div>`;
      })
      .join("");

    return `
      <div class="intern-detail-grid">
        <div class="intern-chart-card">
          <h4>Yetkinlik Radarı</h4>
          <div class="intern-radar-wrap">${renderRadarSvg(analysis.radar)}</div>
        </div>
        <div class="intern-chart-card">
          <h4>Görev Başarı Dağılımı</h4>
          ${renderSuccessBars(analysis.successBars)}
        </div>
        <div class="intern-chart-card">
          <h4>Haftalık Trend</h4>
          <div class="intern-trend-bars">${trendHtml}</div>
        </div>
        <div class="intern-chart-card">
          <h4>Skor Bileşenleri</h4>
          ${renderScoreBreakdownTable(analysis.scoreBreakdown)}
        </div>
      </div>`;
  }

  function renderTasksTab(_intern, analysis) {
    return `
      <div class="intern-tasks-panel">
        <div class="intern-chart-card">
          <h4>Zaman Çizelgesi</h4>
          ${renderTimeline(analysis.taskTimeline)}
        </div>
        <div class="intern-chart-card">
          <h4>Görev Tablosu</h4>
          ${renderTaskTable(analysis.taskTimeline)}
        </div>
      </div>`;
  }

  function renderFeedbackTab(_intern, analysis) {
    const quotes = analysis.feedbackQuotes;
    if (!quotes.length) {
      return '<p class="intern-exec-summary">Henüz mentor geri bildirim notu yok. Görev değerlendirmelerinde not ekleyin.</p>';
    }
    const items = quotes
      .map((q) => {
        const date = q.date ? new Date(q.date).toLocaleDateString("tr-TR") : "—";
        const stars = q.quality != null ? `Kalite: ${q.quality}/5` : "";
        return `
          <article class="intern-feedback-card">
            <header>
              <strong>${escapeHtml(q.evaluatorName)}</strong>
              <span>${escapeHtml(date)} · ${escapeHtml(q.taskTitle)}</span>
              ${stars ? `<span class="intern-feedback-quality">${escapeHtml(stars)}</span>` : ""}
            </header>
            <p>${escapeHtml(q.note)}</p>
          </article>`;
      })
      .join("");
    return `<div class="intern-feedback-list">${items}</div>`;
  }

  function renderFinanceTab(intern, analysis) {
    const p = getPortfolio(intern.id);
    const f = analysis.finance;
    const fi = p.financeInputs || {};
    return `
      <div class="intern-finance-grid">
        <div class="intern-finance-item">
          <label>Aylık stajyer maliyeti (₺)</label>
          <input class="input finance-input" data-field="monthlyCost" type="number" value="${Number(fi.monthlyCost) || f.monthly}" />
        </div>
        <div class="intern-finance-item">
          <label>Mentor saat ücreti (₺)</label>
          <input class="input finance-input" data-field="mentorHourlyRate" type="number" value="${Number(fi.mentorHourlyRate) || f.mentorRate}" />
        </div>
        <div class="intern-finance-item">
          <label>Haftalık mentor saati</label>
          <input class="input finance-input" data-field="mentorHoursWeek" type="number" value="${Number(fi.mentorHoursWeek) || f.mentorHours}" />
        </div>
        <div class="intern-finance-item">
          <label>Tahmini katkı değeri (₺)</label>
          <input class="input finance-input" data-field="estimatedValue" type="number" value="${Number(fi.estimatedValue) || f.estimatedValue}" />
        </div>
        <div class="intern-finance-item">
          <label>Dış işe alım maliyeti (₺)</label>
          <input class="input finance-input" data-field="externalHireCost" type="number" value="${Number(fi.externalHireCost) || f.externalHire}" />
        </div>
        <div class="intern-finance-summary">
          <p><strong>Toplam maliyet:</strong> ₺${f.totalCost.toLocaleString("tr-TR")} · <strong>ROI:</strong> %${f.roi}</p>
          <p><strong>Net kâr / katkı:</strong> ₺${f.netProfit.toLocaleString("tr-TR")} · <strong>Tasarruf:</strong> ₺${f.savings.toLocaleString("tr-TR")}</p>
          <p><strong>Dış işe alım karşılaştırması:</strong> ₺${f.externalHire.toLocaleString("tr-TR")} · <strong>Break-even:</strong> ${f.breakEvenWeek != null ? `${f.breakEvenWeek}. hafta` : "—"}</p>
          <button type="button" class="btn-ghost" style="margin-top:12px" data-action="save-finance">Finans girdilerini kaydet</button>
        </div>
      </div>
      <div class="intern-decision-log">${renderDecisionLog(p)}</div>`;
  }

  function renderDecisionLog(portfolio) {
    const logs = portfolio.decisionLog || [];
    if (!logs.length) return "Henüz karar kaydı yok.";
    return logs
      .slice(-5)
      .reverse()
      .map((l) => `<div>• ${escapeHtml(l.action)} — ${escapeHtml(l.byName || "HR")} (${new Date(l.at).toLocaleString("tr-TR")})</div>`)
      .join("");
  }

  function updateKpis(analyses) {
    const totalEl = document.getElementById("internKpiTotal");
    const avgEl = document.getElementById("internKpiAvg");
    if (totalEl) totalEl.textContent = String(analyses.length);
    if (avgEl) {
      avgEl.textContent = analyses.length
        ? String(Math.round(analyses.reduce((s, a) => s + a.score, 0) / analyses.length))
        : "—";
    }
  }

  function syncFilterControls() {
    const weekSel = document.getElementById("internWeekFilter");
    const catSel = document.getElementById("internCategoryFilter");
    if (weekSel) weekSel.value = activeWeekFilter;
    if (catSel) catSel.value = activeCategoryFilter;
  }

  function renderGrid() {
    const grid = document.getElementById("internCardGrid");
    const panel = document.getElementById("internDetailPanel");
    if (!grid) return;

    const stajyersAll = getStajyers();
    renderDeptFilters(stajyersAll);

    const stajyers = stajyersAll.filter((u) => {
      if (activeDeptFilter === "ALL") return true;
      return String(u.departman || "").trim() === activeDeptFilter;
    });

    const analyses = stajyers.map((u) => ({ intern: u, analysis: analyze(u) }));
    updateKpis(analyses.map((x) => x.analysis));

    if (!stajyers.length) {
      grid.innerHTML =
        '<div class="intern-v2-empty">Bu filtrede stajyer yok. Kullanıcılar sayfasından STAJYER ekleyebilirsiniz.</div>';
      panel?.classList.add("hidden");
      selectedInternId = "";
      return;
    }

    grid.innerHTML = analyses.map(({ intern, analysis }) => renderInternCard(intern, analysis)).join("");

    grid.querySelectorAll(".intern-v2-card").forEach((card) => {
      card.onclick = () => openDetail(card.dataset.internId);
    });

    if (selectedInternId && stajyers.some((u) => String(u.id) === selectedInternId)) {
      openDetail(selectedInternId, false);
    } else if (selectedInternId) {
      selectedInternId = "";
      panel?.classList.add("hidden");
    }
  }

  function openDetail(internId, scroll = true) {
    selectedInternId = String(internId);
    const intern = getStajyers().find((u) => String(u.id) === selectedInternId);
    const panel = document.getElementById("internDetailPanel");
    const body = document.getElementById("internDetailBody");
    if (!intern || !panel || !body) return;

    syncFilterControls();
    gridHighlightSelected();
    const analysis = analyze(intern);
    panel.classList.remove("hidden");

    if (activeDetailTab === "executive") body.innerHTML = renderExecutive(intern, analysis);
    else if (activeDetailTab === "performance") body.innerHTML = renderPerformanceTab(intern, analysis);
    else if (activeDetailTab === "tasks") body.innerHTML = renderTasksTab(intern, analysis);
    else if (activeDetailTab === "feedback") body.innerHTML = renderFeedbackTab(intern, analysis);
    else body.innerHTML = renderFinanceTab(intern, analysis);

    bindDetailActions(intern);
    if (scroll) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function gridHighlightSelected() {
    document.querySelectorAll(".intern-v2-card").forEach((c) => {
      c.classList.toggle("selected", c.dataset.internId === selectedInternId);
    });
  }

  async function appendDecisionLog(internId, action) {
    const portfolios = [...(ctx.portfolios || [])];
    let p = portfolios.find((x) => String(x.internId) === String(internId));
    if (!p) {
      p = { internId: String(internId), financeInputs: {}, decisionLog: [] };
      portfolios.push(p);
    }
    p.decisionLog = p.decisionLog || [];
    p.decisionLog.push({
      action,
      by: ctx.currentUser?.id,
      byName: ctx.getUserFullName(ctx.currentUser),
      at: new Date().toISOString()
    });
    await ctx.savePortfolios(portfolios);
    ctx.setPortfolios(portfolios);
    openDetail(internId, false);
  }

  function bindDetailActions(intern) {
    const body = document.getElementById("internDetailBody");
    if (!body) return;

    body.querySelector("[data-action='log-hire']")?.addEventListener("click", async () => {
      const a = analyze(intern);
      await appendDecisionLog(intern.id, `Full-time önerildi (InternScore ${a.score}) — ${a.segment.recommendation}`);
    });

    body.querySelector("[data-action='print-summary']")?.addEventListener("click", () => {
      document.body.classList.add("intern-print-mode");
      window.print();
      setTimeout(() => document.body.classList.remove("intern-print-mode"), 500);
    });

    body.querySelector("[data-action='save-finance']")?.addEventListener("click", async () => {
      const portfolios = [...(ctx.portfolios || [])];
      let p = portfolios.find((x) => String(x.internId) === String(intern.id));
      if (!p) {
        p = { internId: String(intern.id), financeInputs: {}, decisionLog: [] };
        portfolios.push(p);
      }
      p.financeInputs = p.financeInputs || {};
      body.querySelectorAll(".finance-input").forEach((inp) => {
        if (inp.dataset.field) p.financeInputs[inp.dataset.field] = Number(inp.value) || 0;
      });
      await ctx.savePortfolios(portfolios);
      ctx.setPortfolios(portfolios);
      openDetail(intern.id, false);
    });
  }

  function bindShell() {
    const closeBtn = document.getElementById("internDetailClose");
    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = "1";
      closeBtn.addEventListener("click", () => {
        selectedInternId = "";
        document.getElementById("internDetailPanel")?.classList.add("hidden");
        gridHighlightSelected();
      });
    }

    const tabs = document.getElementById("internDetailTabs");
    if (tabs && !tabs.dataset.bound) {
      tabs.dataset.bound = "1";
      tabs.addEventListener("click", (e) => {
        const btn = e.target.closest(".intern-v2-tab");
        if (!btn || !selectedInternId) return;
        activeDetailTab = btn.dataset.tab || "executive";
        tabs.querySelectorAll(".intern-v2-tab").forEach((b) => b.classList.toggle("active", b === btn));
        openDetail(selectedInternId, false);
      });
    }

    const weekSel = document.getElementById("internWeekFilter");
    if (weekSel && !weekSel.dataset.bound) {
      weekSel.dataset.bound = "1";
      weekSel.addEventListener("change", () => {
        activeWeekFilter = weekSel.value;
        if (selectedInternId) openDetail(selectedInternId, false);
      });
    }

    const catSel = document.getElementById("internCategoryFilter");
    if (catSel && !catSel.dataset.bound) {
      catSel.dataset.bound = "1";
      catSel.addEventListener("change", () => {
        activeCategoryFilter = catSel.value || "ALL";
        if (selectedInternId) openDetail(selectedInternId, false);
      });
    }
  }

  window.initStajyerlerimPage = function initStajyerlerimPage(context) {
    ctx = context;
    activeDetailTab = "executive";
    activeDeptFilter = "ALL";
    activeWeekFilter = "";
    activeCategoryFilter = "ALL";
    bindShell();
    renderGrid();
    window.__stajyerlerimRefresh = renderGrid;
  };
})();
