// ============================================
// エラーを画面に直接表示する仕組み
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

// URLの ?id=xxx からテーマIDを取得
const params = new URLSearchParams(window.location.search);
const themeId = params.get("id");

window.addEventListener("DOMContentLoaded", async () => {
  if (!sb) return;

  if (!themeId) {
    showFatalError("Problemが指定されていません");
    return;
  }

  try {
    const [themeRes, instancesRes, fbRes, tryRes] = await Promise.all([
      sb.from("problem_themes").select("*").eq("id", themeId).single(),
      sb.from("problem_instances").select("date").eq("problem_theme_id", themeId).order("date"),
      sb.from("feedbacks").select("*").eq("related_problem_theme_id", themeId).order("date", { ascending: false }),
      sb.from("trys").select("*").eq("related_problem_theme_id", themeId).order("date", { ascending: false }),
    ]);

    if (themeRes.error) throw themeRes.error;

    renderTheme(themeRes.data);
    renderBarChart(instancesRes.data || []);
    renderFeedbacks(fbRes.data || []);
    renderTrys(tryRes.data || []);
  } catch (err) {
    console.error(err);
    showFatalError("データの読み込みに失敗しました: " + err.message);
  }
});

// ============================================
// 基本情報の表示
// ============================================
function renderTheme(theme) {
  document.getElementById("themeName").textContent = theme.name;
  document.title = theme.name + " | Problem詳細";
  document.getElementById("themeImportance").textContent = theme.importance || "中";
  document.getElementById("themeStatus").textContent = theme.status || "未対応";
  document.getElementById("themeCategory").textContent = theme.category || "未分類";
  document.getElementById("occurrenceCount").textContent = `${theme.occurrence_count || 0}回`;
  document.getElementById("firstOccurrence").textContent = theme.first_occurrence
    ? formatDate(theme.first_occurrence)
    : "-";
  document.getElementById("lastOccurrence").textContent = theme.last_occurrence
    ? formatDate(theme.last_occurrence)
    : "-";
}

// ============================================
// 週ごとの発生推移(棒グラフ)
// 直近8週分を、Problem発生日から集計して表示する
// ============================================
function renderBarChart(instances) {
  const chartArea = document.getElementById("barChart");

  if (instances.length === 0) {
    chartArea.innerHTML = `<p class="empty-note">まだ発生記録がありません。</p>`;
    return;
  }

  // 週の始まり(月曜日)ごとに件数を集計する
  const weekCounts = {};
  instances.forEach((row) => {
    const weekStart = getWeekStart(row.date);
    weekCounts[weekStart] = (weekCounts[weekStart] || 0) + 1;
  });

  const sortedWeeks = Object.keys(weekCounts).sort();
  const last8Weeks = sortedWeeks.slice(-8);
  const maxCount = Math.max(...last8Weeks.map((w) => weekCounts[w]));

  chartArea.innerHTML = last8Weeks
    .map((week) => {
      const count = weekCounts[week];
      const heightPercent = Math.max((count / maxCount) * 100, 8);
      const label = formatDate(week);
      return `
        <div class="bar-col">
          <div class="bar" style="height:${heightPercent}%;" title="${count}件"></div>
          <div class="bar-label">${label}</div>
        </div>
      `;
    })
    .join("");
}

// 指定日を含む週の月曜日の日付(YYYY-MM-DD)を返す
function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0=日曜
  const diff = day === 0 ? -6 : 1 - day; // 月曜を週の始まりとする
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ============================================
// 関連FB
// ============================================
function renderFeedbacks(feedbacks) {
  const area = document.getElementById("relatedFbArea");

  if (feedbacks.length === 0) {
    area.innerHTML = `<p class="empty-note">関連するFBはまだありません。</p>`;
    return;
  }

  area.innerHTML = feedbacks
    .map(
      (f) => `
      <div class="related-item">
        <span class="date-tag">${formatDate(f.date)}</span>${escapeHtml(f.content)}
      </div>
    `
    )
    .join("");
}

// ============================================
// 関連Try
// ============================================
function renderTrys(trys) {
  const area = document.getElementById("relatedTryArea");

  if (trys.length === 0) {
    area.innerHTML = `<p class="empty-note">関連するTryはまだありません。</p>`;
    return;
  }

  area.innerHTML = trys
    .map((t) => {
      const mark = t.execution_status === "実行した" ? "✓" : t.execution_status === "しなかった" ? "✗" : "・";
      return `
        <div class="related-item">
          <span class="date-tag">${formatDate(t.date)}</span>${mark} ${escapeHtml(t.action)}
        </div>
      `;
    })
    .join("");
}

// ============================================
// 小さなユーティリティ
// ============================================
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}
