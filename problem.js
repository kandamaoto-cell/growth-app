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

let allThemes = [];
let currentFilter = "all";

window.addEventListener("DOMContentLoaded", async () => {
  if (!sb) return;

  try {
    const { data, error } = await sb
      .from("problem_themes")
      .select("*")
      .order("last_occurrence", { ascending: false, nullsFirst: false });

    if (error) throw error;
    allThemes = data || [];
    renderList();
  } catch (err) {
    console.error(err);
    showFatalError("Problemの読み込みに失敗しました: " + err.message);
  }

  document.querySelectorAll(".filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      renderList();
    });
  });
});

function applyFilter(themes) {
  switch (currentFilter) {
    case "important":
      return themes.filter((t) => t.importance === "高");
    case "improving":
      return themes.filter((t) => ["改善中", "改善傾向"].includes(t.status));
    case "overcome":
      return themes.filter((t) => t.status === "克服");
    case "relapse":
      return themes.filter((t) => t.status === "再発");
    default:
      return themes;
  }
}

function renderList() {
  const area = document.getElementById("problemListArea");
  const filtered = applyFilter(allThemes);

  if (filtered.length === 0) {
    area.innerHTML = `<p class="empty-note" style="padding:20px;">該当するProblemはまだありません。</p>`;
    return;
  }

  area.innerHTML = filtered
    .map((t) => {
      const dotClass = statusDotClass(t.status);
      const lastOccurrence = t.last_occurrence ? formatDate(t.last_occurrence) : "-";
      return `
        <a class="problem-list-item" href="problem-detail.html?id=${t.id}">
          <div class="top-row">
            <span class="status-dot ${dotClass}"></span>
            <span>${escapeHtml(t.name)}</span>
          </div>
          <div class="meta-row">
            発生 ${t.occurrence_count || 0}回｜最終発生：${lastOccurrence}｜${escapeHtml(t.status || "未対応")}
          </div>
        </a>
      `;
    })
    .join("");
}

function statusDotClass(status) {
  if (status === "克服") return "green";
  if (["改善傾向", "克服候補"].includes(status)) return "orange";
  if (["未対応", "改善中", "再発"].includes(status)) return "red";
  return "gray";
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}
