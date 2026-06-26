/**
 * InternScore — HR karar motoru (İK MVP v2).
 * Görev verilerinden stajyer performans skorunu hesaplar.
 */
(function (root) {
  const WEIGHT_PRESETS = {
    default: {
      completion: 0.25,
      quality: 0.2,
      proactive: 0.15,
      onTime: 0.15,
      communication: 0.1,
      learning: 0.1,
      independence: 0.05
    },
    yazilim: {
      completion: 0.25,
      quality: 0.25,
      proactive: 0.15,
      onTime: 0.15,
      communication: 0.05,
      learning: 0.1,
      independence: 0.05
    }
  };

  const SEGMENTS = [
    { min: 85, label: "Yıldız", tone: "star", recommendation: "Full-time değerlendirin" },
    { min: 70, label: "Başarılı", tone: "success", recommendation: "Teklif adayı" },
    { min: 55, label: "Gelişiyor", tone: "progress", recommendation: "4 hafta daha izleyin" },
    { min: 40, label: "Kritik", tone: "warning", recommendation: "Müdahale planı gerekli" },
    { min: 0, label: "Uyumsuz", tone: "danger", recommendation: "Çıkış görüşmesi önerilir" }
  ];

  const CLASS_BANDS = [
    { min: 90, label: "Çok Güçlü", tone: "star" },
    { min: 70, label: "İyi", tone: "success" },
    { min: 50, label: "Ortalama", tone: "progress" },
    { min: 0, label: "Geliştirilmeli", tone: "warning" }
  ];

  const BREAKDOWN_LABELS = {
    completion: "Görev Tamamlama",
    quality: "Kalite",
    proactive: "İnisiyatif",
    onTime: "Zaman Yönetimi",
    communication: "İletişim",
    learning: "Öğrenme Hızı",
    independence: "Adaptasyon"
  };

  function pickPreset(department) {
    const d = String(department || "").toLowerCase();
    if (d.includes("yazılım") || d.includes("yazilim") || d.includes("veri")) return WEIGHT_PRESETS.yazilim;
    return WEIGHT_PRESETS.default;
  }

  function taskBelongsToIntern(task, internId) {
    const id = String(internId);
    const assignees = String(task?.assignees || "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (assignees.includes(id)) return true;
    if (String(task?.senderId || "") === id) return true;
    return false;
  }

  function getInternTasks(allTasks, internId) {
    return (allTasks || []).filter((t) => taskBelongsToIntern(t, internId));
  }

  function filterInternTasks(internTasks, options = {}) {
    let list = [...internTasks];
    const weeks = Number(options.weeks);
    if (weeks > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - weeks * 7);
      list = list.filter((t) => {
        const d = t.completedAt || t.acceptedAt || t.createdAt;
        return d && new Date(d) >= cutoff;
      });
    }
    const category = options.category;
    if (category && category !== "ALL") {
      list = list.filter((t) => String(t.category || "Genel") === String(category));
    }
    return list;
  }

  function normalizeStatus(status) {
    const s = String(status || "").trim().toLowerCase();
    if (s === "tamamlanan") return "Tamamlanan";
    if (s === "başarısız" || s === "basarisiz") return "Başarısız";
    if (s === "devam eden") return "Devam Eden";
    return status || "Devam Eden";
  }

  function isOnTime(task) {
    if (!task?.dueDate || !task?.completedAt) return null;
    try {
      return String(task.completedAt).slice(0, 10) <= String(task.dueDate).slice(0, 10);
    } catch {
      return null;
    }
  }

  function avgEval(tasks, field) {
    const vals = tasks
      .map((t) => t.mentorEvaluation?.[field])
      .filter((v) => typeof v === "number" && v >= 1 && v <= 5);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function computeMetrics(internTasks) {
    const total = internTasks.length;
    const completed = internTasks.filter((t) => normalizeStatus(t.status) === "Tamamlanan");
    const failed = internTasks.filter((t) => normalizeStatus(t.status) === "Başarısız");
    const completionRate = total ? (completed.length / total) * 100 : 0;

    const withDue = completed.filter((t) => t.dueDate);
    const onTimeCount = withDue.filter((t) => isOnTime(t) === true).length;
    const onTimeRate = withDue.length ? (onTimeCount / withDue.length) * 100 : completionRate;

    const qualityAvg = avgEval(completed, "quality");
    const independenceAvg = avgEval(completed, "independence");
    const qualityScore = qualityAvg != null ? (qualityAvg / 5) * 100 : completionRate * 0.7;
    const independenceScore = independenceAvg != null ? (independenceAvg / 5) * 100 : completionRate * 0.6;

    const sorted = [...completed].sort((a, b) => String(a.completedAt || "").localeCompare(String(b.completedAt || "")));
    let learningScore = 70;
    if (sorted.length >= 2) {
      const mid = Math.floor(sorted.length / 2);
      const firstQ = avgEval(sorted.slice(0, mid), "quality") || 3;
      const secondQ = avgEval(sorted.slice(mid), "quality") || firstQ;
      learningScore = clamp(50 + (secondQ - firstQ) * 25, 0, 100);
    }

    const earlyCount = completed.filter((t) => {
      if (!t.dueDate || !t.completedAt) return false;
      const diff = (new Date(t.dueDate) - new Date(t.completedAt.slice(0, 10))) / 86400000;
      return diff >= 1;
    }).length;
    const proactiveScore = completed.length ? clamp((earlyCount / completed.length) * 100 + 20, 0, 100) : 40;

    const communicationScore = clamp(completionRate * 0.5 + (qualityAvg != null ? qualityAvg * 12 : 40), 0, 100);

    return {
      total,
      completedCount: completed.length,
      failedCount: failed.length,
      completionRate,
      onTimeRate,
      qualityScore,
      independenceScore,
      learningScore,
      proactiveScore,
      communicationScore,
      qualityAvg,
      independenceAvg
    };
  }

  function computeInternScore(metrics, department) {
    const w = pickPreset(department);
    const raw =
      metrics.completionRate * w.completion +
      metrics.onTimeRate * w.onTime +
      metrics.qualityScore * w.quality +
      metrics.independenceScore * w.independence +
      metrics.learningScore * w.learning +
      metrics.proactiveScore * w.proactive +
      metrics.communicationScore * w.communication;
    return Math.round(clamp(raw, 0, 100));
  }

  function getSegment(score) {
    return SEGMENTS.find((s) => score >= s.min) || SEGMENTS[SEGMENTS.length - 1];
  }

  function getClassBand(score) {
    return CLASS_BANDS.find((b) => score >= b.min) || CLASS_BANDS[CLASS_BANDS.length - 1];
  }

  function buildScoreBreakdown(metrics, department) {
    const w = pickPreset(department);
    const keys = ["completion", "quality", "proactive", "onTime", "communication", "learning", "independence"];
    const valueMap = {
      completion: metrics.completionRate,
      quality: metrics.qualityScore,
      proactive: metrics.proactiveScore,
      onTime: metrics.onTimeRate,
      communication: metrics.communicationScore,
      learning: metrics.learningScore,
      independence: metrics.independenceScore
    };
    return keys.map((key) => {
      const value = Math.round(valueMap[key] || 0);
      const weight = w[key] || 0;
      return {
        key,
        label: BREAKDOWN_LABELS[key] || key,
        value,
        weight,
        weightPct: Math.round(weight * 100),
        contribution: Math.round(value * weight)
      };
    });
  }

  function getRadarAxes(metrics) {
    return [
      { key: "completion", label: "Tamamlama", value: Math.round(metrics.completionRate) },
      { key: "quality", label: "Kalite", value: Math.round(metrics.qualityScore) },
      { key: "proactive", label: "İnisiyatif", value: Math.round(metrics.proactiveScore) },
      { key: "onTime", label: "Zamanında", value: Math.round(metrics.onTimeRate) },
      { key: "learning", label: "Öğrenme", value: Math.round(metrics.learningScore) },
      { key: "independence", label: "Adaptasyon", value: Math.round(metrics.independenceScore) },
      { key: "communication", label: "İletişim", value: Math.round(metrics.communicationScore) }
    ];
  }

  function getWeeklyTrend(internTasks, weeks = 8) {
    const now = new Date();
    const buckets = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const end = new Date(now);
      end.setDate(end.getDate() - w * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      const label = start.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
      const inWeek = internTasks.filter((t) => {
        const d = t.completedAt || t.acceptedAt || t.createdAt;
        if (!d) return false;
        const dt = new Date(d);
        return dt >= start && dt <= end;
      });
      const done = inWeek.filter((t) => normalizeStatus(t.status) === "Tamamlanan").length;
      const score = inWeek.length ? Math.round((done / inWeek.length) * 100) : null;
      buckets.push({ label, score, taskCount: inWeek.length, completed: done });
    }
    return buckets;
  }

  function detectRedFlags(score, trend, metrics) {
    const flags = [];
    const recent = trend.slice(-2).map((t) => t.score).filter((s) => s != null);
    if (recent.length === 2 && recent[0] - recent[1] >= 15) {
      flags.push("Son 2 haftada performans %15+ düştü");
    }
    if (score < 40) flags.push("Genel skor kritik eşiğin altında");
    if (metrics.failedCount >= 2) flags.push(`${metrics.failedCount} başarısız görev`);
    if (metrics.total >= 3 && metrics.completionRate < 50) flags.push("Görev tamamlama oranı düşük");
    if (metrics.onTimeRate < 50 && metrics.total >= 2) flags.push("Zamanında teslim oranı düşük");
    return flags;
  }

  function buildSuccessBars(metrics, internTasks) {
    const ongoing = internTasks.filter((t) => normalizeStatus(t.status) === "Devam Eden").length;
    return {
      completed: metrics.completedCount,
      failed: metrics.failedCount,
      ongoing,
      total: metrics.total
    };
  }

  function formatDateShort(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
    } catch {
      return "—";
    }
  }

  function buildTaskTimeline(internTasks) {
    return internTasks
      .map((t) => {
        const status = normalizeStatus(t.status);
        const start = t.acceptedAt || t.createdAt;
        const end = t.completedAt || (status === "Devam Eden" ? null : t.dueDate);
        let late = false;
        if (t.dueDate && t.completedAt) {
          late = String(t.completedAt).slice(0, 10) > String(t.dueDate).slice(0, 10);
        } else if (t.dueDate && status === "Devam Eden") {
          late = String(new Date().toISOString()).slice(0, 10) > String(t.dueDate).slice(0, 10);
        }
        return {
          id: t.taskId || t.id,
          title: t.title || "Görev",
          category: t.category || "Genel",
          start,
          end,
          dueDate: t.dueDate,
          status,
          late,
          actualDurationDays: t.actualDurationDays,
          estimatedHours: t.estimatedHours,
          quality: t.mentorEvaluation?.quality
        };
      })
      .sort((a, b) => String(b.start || "").localeCompare(String(a.start || "")));
  }

  function buildFeedbackQuotes(internTasks, usersById) {
    const completed = internTasks.filter((t) => normalizeStatus(t.status) === "Tamamlanan" && t.mentorEvaluation?.note);
    return completed
      .map((t) => {
        const evaluatorId = t.senderId || t.evaluatorId;
        const evaluator = usersById?.[String(evaluatorId)];
        const evaluatorName = evaluator?.ad_soyad || t.sender || "Mentor";
        return {
          taskTitle: t.title || "Görev",
          note: String(t.mentorEvaluation.note).trim(),
          evaluatorName,
          date: t.completedAt || t.submittedAt,
          quality: t.mentorEvaluation.quality
        };
      })
      .filter((q) => q.note.length > 0)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }

  function buildRecommendations(score, metrics, radar, flags, trend) {
    const recs = [];
    if (metrics.onTimeRate < 60) {
      recs.push("Zaman yönetimi eğitimi ve deadline takibi güçlendirilmeli.");
    }
    if (metrics.qualityScore < 60) {
      recs.push("Kod review / kalite kontrol sıklığı artırılmalı.");
    }
    const sorted = [...radar].sort((a, b) => a.value - b.value);
    sorted.slice(0, 2).forEach((ax) => {
      if (ax.value < 65) {
        recs.push(`${ax.label} alanında gelişim planı oluşturulmalı (skor: ${ax.value}).`);
      }
    });
    const trendScores = trend.map((t) => t.score).filter((s) => s != null);
    if (trendScores.length >= 3) {
      const firstHalf = trendScores.slice(0, Math.floor(trendScores.length / 2));
      const secondHalf = trendScores.slice(Math.floor(trendScores.length / 2));
      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      if (avgSecond < avgFirst - 10) {
        recs.push("Öğrenme eğrisi düşüyor — görev zorluğu veya mentorluk gözden geçirilmeli.");
      }
    }
    if (metrics.learningScore < 55 && metrics.total >= 3) {
      recs.push("Öğrenme hızı düşük — mentorluk sıklığı ve görev çeşitliliği artırılabilir.");
    }
    flags.forEach((f) => {
      if (f.includes("başarısız")) recs.push("Başarısız görevler için kök neden analizi yapılmalı.");
    });
    if (score >= 85 && flags.length === 0) {
      recs.push("Full-time değerlendirme önerilir.");
    }
    if (!recs.length) {
      recs.push("Mevcut performans dengeli — izlemeye devam edin.");
    }
    return [...new Set(recs)];
  }

  function buildExecutiveSummary(intern, score, segment, classBand, metrics, flags) {
    const name = intern?.ad_soyad || "Stajyer";
    const trendText =
      metrics.completedCount === 0
        ? "Henüz onaylanmış görev teslimi yok."
        : `${metrics.completedCount}/${metrics.total} görev tamamlandı, zamanında teslim %${Math.round(metrics.onTimeRate)}.`;
    const flagText = flags.length ? ` Dikkat: ${flags[0]}.` : "";
    return `${name} InternScore ${score}/100 (${classBand.label}). ${trendText}${flagText} Öneri: ${segment.recommendation}.`;
  }

  function computeFinance(portfolio, metrics, score) {
    const monthly = Number(portfolio?.financeInputs?.monthlyCost) || 15000;
    const mentorRate = Number(portfolio?.financeInputs?.mentorHourlyRate) || 250;
    const mentorHours = Number(portfolio?.financeInputs?.mentorHoursWeek) || 3;
    const estimatedValue = Number(portfolio?.financeInputs?.estimatedValue) || metrics.completedCount * 8000;
    const weeks = Number(portfolio?.internshipWeeks) || 12;
    const internCost = (monthly / 4) * weeks;
    const mentorCost = mentorRate * mentorHours * weeks;
    const totalCost = internCost + mentorCost;
    const roi = totalCost > 0 ? Math.round(((estimatedValue - totalCost) / totalCost) * 100) : 0;
    const externalHire = Number(portfolio?.financeInputs?.externalHireCost) || 85000;
    const savings = Math.max(0, externalHire - totalCost);
    const netProfit = estimatedValue - totalCost;
    const breakEvenWeek =
      estimatedValue > 0 && totalCost > 0 ? Math.ceil((totalCost / estimatedValue) * weeks) : null;
    const conversionBonus = score >= 70 ? savings * 0.15 : 0;
    return {
      monthly,
      mentorRate,
      mentorHours,
      estimatedValue,
      internCost: Math.round(internCost),
      mentorCost: Math.round(mentorCost),
      totalCost: Math.round(totalCost),
      roi,
      externalHire,
      savings: Math.round(savings + conversionBonus),
      netProfit: Math.round(netProfit),
      breakEvenWeek,
      conversionLikelihood: clamp(Math.round(score * 0.85 + (metrics.learningScore > 70 ? 10 : 0)), 5, 95)
    };
  }

  function buildFunnel(internTasks) {
    const assigned = internTasks.length;
    const started = internTasks.filter((t) => t.acceptedAt || normalizeStatus(t.status) !== "Devam Eden" || t.status).length;
    const submitted = internTasks.filter((t) => t.submittedAt || normalizeStatus(t.status) === "Tamamlanan").length;
    const approved = internTasks.filter((t) => t.mentorEvaluation || normalizeStatus(t.status) === "Tamamlanan").length;
    const scored = internTasks.filter((t) => t.mentorEvaluation?.quality).length;
    return [
      { stage: "Atandı", count: assigned },
      { stage: "Başlandı", count: Math.max(started, assigned ? 1 : 0) },
      { stage: "Teslim", count: submitted },
      { stage: "Onaylandı", count: approved },
      { stage: "Puanlandı", count: scored }
    ];
  }

  function analyzeIntern(intern, allTasks, portfolio, options = {}) {
    const allInternTasks = getInternTasks(allTasks, intern.id);
    const internTasks = filterInternTasks(allInternTasks, options);
    const metrics = computeMetrics(internTasks);
    const score = computeInternScore(metrics, intern.departman);
    const segment = getSegment(score);
    const classBand = getClassBand(score);
    const trend = getWeeklyTrend(internTasks);
    const flags = detectRedFlags(score, trend, metrics);
    const radar = getRadarAxes(metrics);
    const finance = computeFinance(portfolio, metrics, score);
    const funnel = buildFunnel(internTasks);
    const summary = buildExecutiveSummary(intern, score, segment, classBand, metrics, flags);
    const scoreBreakdown = buildScoreBreakdown(metrics, intern.departman);
    const successBars = buildSuccessBars(metrics, internTasks);
    const taskTimeline = buildTaskTimeline(internTasks);
    const usersById = options.usersById || {};
    const feedbackQuotes = buildFeedbackQuotes(internTasks, usersById);
    const recommendations = buildRecommendations(score, metrics, radar, flags, trend);
    const statusTone =
      flags.length >= 2 || score < 40 ? "danger" : score < 55 ? "warning" : score >= 70 ? "success" : "neutral";

    return {
      internId: String(intern.id),
      score,
      segment,
      classBand,
      metrics,
      trend,
      flags,
      radar,
      finance,
      funnel,
      summary,
      scoreBreakdown,
      successBars,
      taskTimeline,
      feedbackQuotes,
      recommendations,
      statusTone,
      internTasks,
      allInternTasks
    };
  }

  root.InternScore = {
    analyzeIntern,
    getInternTasks,
    filterInternTasks,
    getSegment,
    getClassBand,
    computeInternScore,
    SEGMENTS,
    CLASS_BANDS
  };
})(typeof window !== "undefined" ? window : globalThis);
