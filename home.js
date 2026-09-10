// ============================================
// エラーを画面に直接表示する仕組み(app.jsと同じ考え方)
// ============================================
function showFatalError(message) {
  const banner = document.createElement("div");
  banner.style.cssText =
    "background:#8B5E4D;color:#fff;padding:14px 20px;font-size:13px;line-height:1.6;";
  banner.textContent = "⚠️ " + message;
  document.body.prepend(banner);
}

let sb = null;
try {
  if (typeof window.supabase === "undefined") {
    throw new Error("Supabaseライブラリが読み込めていません");
  }
  if (SUPABASE_URL.includes("ここに") || SUPABASE_ANON_KEY.includes("ここに")) {
    throw new Error("supabase-config.jsの値がまだ書き換えられていません");
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (err) {
  console.error(err);
  showFatalError(err.message);
}

const today = new Date();
const todayStr = today.toISOString().slice(0, 10);

// 挨拶(朝/昼/夜で切り替え)
const hour = today.getHours();
const greeting = hour < 11 ? "おはようございます" : hour < 18 ? "こんにちは" : "お疲れさまです";
document.getElementById("greetingDate").textContent = greeting;
document.getElementById("greetingSub").textContent = today.toLocaleDateString("ja-JP", {
  month: "long",
  day: "numeric",
  weekday: "short",
});

// 重要度の並び替え用
const importanceRank = { 高: 3, 中: 2, 低: 1 };

window.addEventListener("DOMContentLoaded", async () => {
  if (!sb) return;

  try {
    const [themesRes, tryRes, analysisRes] = await Promise.all([
      sb.from("problem_themes").select("*").neq("status", "克服"),
      sb.from("trys").select("*").eq("date", todayStr).order("created_at", { ascending: true }),
      sb
        .from("ai_analysis_history")
        .select("*")
        .eq("date", todayStr)
        .eq("type", "daily")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    if (themesRes.error) throw themesRes.error;
    if (tryRes.error) throw tryRes.error;
    if (analysisRes.error) throw analysisRes.error;

    const themes = themesRes.data || [];
    const todayTrys = tryRes.data || [];
    const analysis = (analysisRes.data && analysisRes.data[0]) || null;

    renderFocus(analysis);
    renderImportantProblem(themes);
    renderTodayTry(todayTrys);
    renderRepeatingProblems(themes);
    renderImproved(themes);
    renderAiAnalysis(analysis);
  } catch (err) {
    console.error(err);
    showFatalError("データの読み込みに失敗しました: " + err.message);
  }
});

// ============================================
// 今日のフォーカス
// ============================================
function renderFocus(analysis) {
  const card = document.getElementById("focusCard");
  const text = document.getElementById("focusText");

  if (analysis && analysis.focus_of_the_day) {
    text.textContent = analysis.focus_of_the_day;
    card.classList.remove("empty");
  } else {
    card.classList.add("empty");
    text.textContent = "今日はまだ記録がありません。Recordから記録すると、ここにフォーカスが表示されます。";
  }
}

// ============================================
// 重要なProblem(重要度→発生回数の順で1件)
// ============================================
function renderImportantProblem(themes) {
  const area = document.getElementById("importantProblemArea");

  if (themes.length === 0) {
    area.innerHTML = `<p class="empty-note">まだ記録されているProblemはありません。</p>`;
    return;
  }

  const sorted = [...themes].sort((a, b) => {
    const rankDiff = (importanceRank[b.importance] || 0) - (importanceRank[a.importance] || 0);
    if (rankDiff !== 0) return rankDiff;
    return (b.occurrence_count || 0) - (a.occurrence_count || 0);
  });

  const top = sorted[0];
  area.innerHTML = `
    <div class="home-problem-card">
      <div>
        <div class="name">${escapeHtml(top.name)}</div>
        <div class="meta">発生 ${top.occurrence_count || 0}回｜${escapeHtml(top.status || "未対応")}</div>
      </div>
      <span class="badge ${importanceBadgeClass(top.importance)}">${top.importance || "中"}</span>
    </div>
  `;
}

// ============================================
// 今日のTry
// ============================================
function renderTodayTry(trys) {
  const area = document.getElementById("todayTryArea");

  if (trys.length === 0) {
    area.innerHTML = `<p class="empty-note">今日はまだTryの記録がありません。</p>`;
    return;
  }

  area.innerHTML = trys
    .map(
      (t) => `
      <div class="try-check-item">
        <span>${t.execution_status === "未回答" ? "☐" : "☑"}</span>
        <span>${escapeHtml(t.action)}</span>
      </div>
    `
    )
    .join("");
}

// ============================================
// 繰り返しているProblem(発生回数2回以上、上位3件)
// ============================================
function renderRepeatingProblems(themes) {
  const area = document.getElementById("repeatingProblemArea");

  const repeating = themes
    .filter((t) => (t.occurrence_count || 0) >= 2)
    .sort((a, b) => (b.occurrence_count || 0) - (a.occurrence_count || 0))
    .slice(0, 3);

  if (repeating.length === 0) {
    area.innerHTML = `<p class="empty-note">繰り返し発生しているProblemはまだありません。</p>`;
    return;
  }

  area.innerHTML = repeating
    .map(
      (t) => `
      <div class="home-problem-card">
        <div class="name">${escapeHtml(t.name)}</div>
        <div class="meta">×${t.occurrence_count}</div>
      </div>
    `
    )
    .join("");
}

// ============================================
// 最近改善したこと(状態が改善系のテーマ)
// ============================================
function renderImproved(themes) {
  const area = document.getElementById("improvedArea");

  const improved = themes.filter((t) => ["改善傾向", "克服候補"].includes(t.status));

  if (improved.length === 0) {
    area.innerHTML = `<p class="empty-note">記録が増えると、ここに改善の兆しが表示されます。</p>`;
    return;
  }

  area.innerHTML = improved
    .map(
      (t) => `
      <div class="home-problem-card">
        <div class="name">${escapeHtml(t.name)}</div>
        <div class="meta">${escapeHtml(t.status)}</div>
      </div>
    `
    )
    .join("");
}

// ============================================
// 今日のAI分析
// ============================================
function renderAiAnalysis(analysis) {
  const area = document.getElementById("aiAnalysisArea");

  if (!analysis || !analysis.summary_text) {
    area.innerHTML = `<p class="empty-note">今日はまだAI分析がありません。</p>`;
    return;
  }

  area.innerHTML = `<p style="font-size:14px; line-height:1.7;">${escapeHtml(analysis.summary_text)}</p>`;
}

// ============================================
// 小さなユーティリティ
// ============================================
function importanceBadgeClass(importance) {
  if (importance === "高") return "high";
  if (importance === "低") return "low";
  return "mid";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}
