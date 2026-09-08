// ============================================
// エラーを画面に直接表示する仕組み
// (スマホだけで開発する場合、開発者ツールが使えないため、
//  何が起きたかを画面上で確認できるようにしておく)
// ============================================
function showFatalError(message) {
  const banner = document.createElement("div");
  banner.style.cssText =
    "background:#8B5E4D;color:#fff;padding:14px 20px;font-size:13px;line-height:1.6;";
  banner.textContent = "⚠️ " + message;
  document.body.prepend(banner);
}

// ============================================
// 初期設定
// ============================================
let sb = null;
try {
  if (typeof window.supabase === "undefined") {
    throw new Error(
      "Supabaseライブラリが読み込めていません(CDNの読み込み失敗の可能性)"
    );
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
const todayStr = today.toISOString().slice(0, 10); // 例: "2026-09-08"

// 画面上部の日付表示(日本語形式)
document.getElementById("todayDate").textContent =
  today.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });

// アクティブなProblem Theme(克服済み以外)を保持しておく箱
let activeThemes = [];

// このセッションで追加したProblemブロックの数
let problemBlockCount = 0;

// 昨日までのTryの回答状態を保持する箱(id → {executed, result})
let followupAnswers = {};


// ============================================
// 起動時の処理
// ============================================
window.addEventListener("DOMContentLoaded", async () => {
  await loadActiveThemes();
  await loadFollowupTrys();
  addProblemBlock(); // 最初のProblem入力欄を1つ表示しておく
  updateRelateVisibility();
});


// ============================================
// アクティブなThemeを読み込む(関連Problem選択用)
// ============================================
async function loadActiveThemes() {
  if (!sb) return;
  const { data, error } = await sb
    .from("problem_themes")
    .select("id, name")
    .neq("status", "克服")
    .order("last_occurrence", { ascending: false });

  if (error) {
    console.error("Theme読み込みエラー:", error);
    return;
  }
  activeThemes = data || [];
}

// 「関連Problem」選択肢を持つ<select>に、共通の選択肢を流し込む
function fillThemeOptions(selectEl, includeUnclassified) {
  selectEl.innerHTML = "";

  if (includeUnclassified) {
    const optNone = document.createElement("option");
    optNone.value = "";
    optNone.textContent = "未分類（後でAIが提案）";
    selectEl.appendChild(optNone);
  } else {
    const optNone = document.createElement("option");
    optNone.value = "";
    optNone.textContent = "関連なし";
    selectEl.appendChild(optNone);
  }

  activeThemes.forEach((theme) => {
    const opt = document.createElement("option");
    opt.value = theme.id;
    opt.textContent = theme.name;
    selectEl.appendChild(opt);
  });
}


// ============================================
// Problemブロックの追加
// ============================================
document.getElementById("addProblemBtn").addEventListener("click", () => {
  addProblemBlock();
  updateRelateVisibility();
});

function addProblemBlock() {
  problemBlockCount++;
  const wrapper = document.createElement("div");
  wrapper.className = "problem-block";
  wrapper.dataset.blockId = problemBlockCount;

  wrapper.innerHTML = `
    <textarea rows="2" class="problem-text" placeholder="発生したProblem"></textarea>
    <div class="theme-row">
      テーマ：
      <select class="problem-theme-select"></select>
    </div>
  `;

  document.getElementById("problemList").appendChild(wrapper);
  fillThemeOptions(wrapper.querySelector(".problem-theme-select"), true);

  // テーマ選択が変わったら、Try/FBの関連表示を更新
  wrapper.querySelector(".problem-theme-select").addEventListener("change", updateRelateVisibility);
  wrapper.querySelector(".problem-text").addEventListener("input", updateRelateVisibility);
}


// ============================================
// Try/FBの「関連Problem」表示を自動で出し分ける
//
// ルール:
// ・入力済みのProblemが0件 → 関連選択は表示しない(関連なし固定)
// ・入力済みのProblemが1件で、既存テーマが選ばれている → 自動関連付けし、選択欄は隠す
// ・それ以外(複数件、または未分類) → 選択欄を表示してユーザーに選んでもらう
// ============================================
function updateRelateVisibility() {
  const filledProblems = [...document.querySelectorAll(".problem-block")].filter(
    (b) => b.querySelector(".problem-text").value.trim().length > 0
  );

  const tryRow = document.getElementById("tryRelateRow");
  const fbRow = document.getElementById("fbRelateRow");
  const trySelect = document.getElementById("tryRelateSelect");
  const fbSelect = document.getElementById("fbRelateSelect");

  if (filledProblems.length === 1) {
    const themeId = filledProblems[0].querySelector(".problem-theme-select").value;
    if (themeId) {
      // 自動関連付け。選択欄は隠すが、値は保持しておく
      tryRow.style.display = "none";
      fbRow.style.display = "none";
      trySelect.dataset.autoValue = themeId;
      fbSelect.dataset.autoValue = themeId;
      return;
    }
  }

  // それ以外は手動選択欄を表示
  delete trySelect.dataset.autoValue;
  delete fbSelect.dataset.autoValue;
  fillThemeOptions(trySelect, false);
  fillThemeOptions(fbSelect, false);
  tryRow.style.display = "block";
  fbRow.style.display = "block";
}


// ============================================
// 昨日までの未回答Tryを読み込む(最大2件)
// ============================================
async function loadFollowupTrys() {
  if (!sb) return;
  const { data, error } = await sb
    .from("trys")
    .select("id, action")
    .eq("execution_status", "未回答")
    .lt("date", todayStr)
    .order("date", { ascending: true })
    .limit(2);

  if (error) {
    console.error("Try読み込みエラー:", error);
    return;
  }

  if (!data || data.length === 0) return;

  document.getElementById("followupSection").style.display = "block";
  const list = document.getElementById("followupList");

  data.forEach((tryItem) => {
    followupAnswers[tryItem.id] = { executed: null, result: null };

    const card = document.createElement("div");
    card.className = "followup-card";
    card.innerHTML = `
      <p class="try-text">「${escapeHtml(tryItem.action)}」</p>
      <div class="choice-group executed-group">
        <button type="button" class="choice-btn" data-value="実行した">実行した</button>
        <button type="button" class="choice-btn" data-value="しなかった">しなかった</button>
      </div>
      <div class="choice-group result-choices">
        <button type="button" class="choice-btn" data-value="成功">成功</button>
        <button type="button" class="choice-btn" data-value="変化なし">変化なし</button>
        <button type="button" class="choice-btn" data-value="悪化">悪化</button>
      </div>
    `;

    const executedGroup = card.querySelector(".executed-group");
    const resultGroup = card.querySelector(".result-choices");

    executedGroup.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        executedGroup.querySelectorAll(".choice-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        followupAnswers[tryItem.id].executed = btn.dataset.value;

        if (btn.dataset.value === "実行した") {
          resultGroup.classList.add("visible");
        } else {
          resultGroup.classList.remove("visible");
          followupAnswers[tryItem.id].result = null;
        }
      });
    });

    resultGroup.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        resultGroup.querySelectorAll(".choice-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        followupAnswers[tryItem.id].result = btn.dataset.value;
      });
    });

    list.appendChild(card);
  });
}


// ============================================
// 保存処理
// ============================================
document.getElementById("saveBtn").addEventListener("click", async () => {
  const saveBtn = document.getElementById("saveBtn");

  if (!sb) {
    alert("データベースに接続できていないため保存できません。画面上部のエラー内容を確認してください。");
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "保存中...";

  // Supabaseへの命令ごとにエラーが無いか確認するための小さな関数
  // (エラーがあれば、内容を持ったまま止める)
  async function run(promise, label) {
    const { data, error } = await promise;
    if (error) {
      throw new Error(`[${label}] ${error.message}`);
    }
    return data;
  }

  try {
    // 1. その日の器(daily_records)を用意
    await run(
      sb.from("daily_records").upsert({ date: todayStr }, { onConflict: "date" }),
      "daily_records"
    );

    // 2. Keep
    const keepText = document.getElementById("keepInput").value.trim();
    if (keepText) {
      await run(sb.from("keeps").insert({ date: todayStr, content: keepText }), "keeps");
    }

    // 3. Problem(複数)。あとでAIに送るため、保存したid付きで結果を受け取る
    const problemBlocks = [...document.querySelectorAll(".problem-block")];
    const problemRowsToInsert = [];
    for (const block of problemBlocks) {
      const text = block.querySelector(".problem-text").value.trim();
      if (!text) continue;
      const themeId = block.querySelector(".problem-theme-select").value || null;
      problemRowsToInsert.push({
        date: todayStr,
        raw_text: text,
        problem_theme_id: themeId,
        theme_confirm_status: themeId ? "確定" : "未提案",
      });
    }

    let insertedProblems = [];
    if (problemRowsToInsert.length > 0) {
      insertedProblems = await run(
        sb.from("problem_instances").insert(problemRowsToInsert).select(),
        "problem_instances"
      );
    }

    // 4. Try
    const tryText = document.getElementById("tryInput").value.trim();
    if (tryText) {
      const trySelect = document.getElementById("tryRelateSelect");
      const relatedThemeId = trySelect.dataset.autoValue || trySelect.value || null;
      await run(
        sb.from("trys").insert({
          date: todayStr,
          action: tryText,
          related_problem_theme_id: relatedThemeId,
          execution_status: "未回答",
        }),
        "trys"
      );
    }

    // 5. FB
    const fbText = document.getElementById("fbInput").value.trim();
    if (fbText) {
      const fbSelect = document.getElementById("fbRelateSelect");
      const relatedThemeId = fbSelect.dataset.autoValue || fbSelect.value || null;
      await run(
        sb.from("feedbacks").insert({
          date: todayStr,
          content: fbText,
          related_problem_theme_id: relatedThemeId,
        }),
        "feedbacks"
      );
    }

    // 6. 昨日までのTryへの回答を反映
    for (const tryId in followupAnswers) {
      const ans = followupAnswers[tryId];
      if (!ans.executed) continue; // 回答していないものはそのまま(未回答)にしておく

      await run(
        sb
          .from("trys")
          .update({
            execution_status: ans.executed,
            result_category: ans.result,
            answered_at: new Date().toISOString(),
          })
          .eq("id", tryId),
        "trys(更新)"
      );
    }

    showToast("保存しました");

    // 7. AI分析(Keep/Problem/Try/FBのいずれかがある場合のみ実行)
    if (keepText || insertedProblems.length > 0 || tryText || fbText) {
      await runAiAnalysis({
        date: todayStr,
        keep: keepText,
        problems: insertedProblems.map((p) => ({ id: p.id, text: p.raw_text })),
        tryText,
        fbText,
      });
    }

    resetForm();
  } catch (err) {
    console.error(err);
    alert("保存中にエラーが発生しました:\n\n" + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "保存する";
  }
});


// ============================================
// AI分析の呼び出しと、結果の反映
// ============================================
async function runAiAnalysis(payload) {
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, activeThemes }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error("AI分析エラー:", result.error);
      showAiError(result.error || "AI分析でエラーが発生しました");
      return;
    }

    // Problemごとの分類結果を反映
    const themeConfirmQueue = [];

    for (const item of result.problemClassifications || []) {
      const updateData = {
        category: item.category || null,
        importance: item.importance || null,
        ai_suggested_theme_id: item.similarThemeId || null,
        ai_confidence: item.similarThemeConfidence || null,
      };

      // 確信度に応じてステータスを更新
      if (item.similarThemeId && item.similarThemeConfidence === "中") {
        updateData.theme_confirm_status = "候補";
      }

      await sb.from("problem_instances").update(updateData).eq("id", item.id);

      // 高確信のものは、ユーザーに確認してもらうキューに入れる
      if (item.similarThemeConfidence === "高") {
        themeConfirmQueue.push(item);
      } else if (!item.similarThemeId && item.newThemeNameSuggestion) {
        // 似たテーマは無いが、新テーマ候補がある場合も確認キューへ
        themeConfirmQueue.push(item);
      }
    }

    // 日次分析結果を保存して画面に表示
    if (result.dailyAnalysis) {
      await sb.from("ai_analysis_history").insert({
        date: payload.date,
        type: "daily",
        summary_text: result.dailyAnalysis,
        focus_of_the_day: result.focusOfTheDaySuggestion || null,
      });

      document.getElementById("aiResultSection").style.display = "block";
      document.getElementById("aiDailyAnalysisText").textContent = result.dailyAnalysis;
      document.getElementById("aiFocusText").textContent =
        result.focusOfTheDaySuggestion || "(今回は特になし)";
    }

    // Theme確認が必要なものがあれば、1件ずつモーダルで確認する
    if (themeConfirmQueue.length > 0) {
      await loadActiveThemes(); // 新しいテーマ判定のために最新化
      processThemeConfirmQueue(themeConfirmQueue);
    }
  } catch (err) {
    console.error("AI分析の呼び出しに失敗:", err);
    showAiError("AI分析の呼び出しに失敗しました: " + err.message);
  }
}

// AI分析のエラーを、結果表示欄に代わりに表示する
function showAiError(message) {
  document.getElementById("aiResultSection").style.display = "block";
  document.getElementById("aiDailyAnalysisText").textContent = "⚠️ " + message;
  document.getElementById("aiFocusText").textContent = "";
}


// ============================================
// Theme確認モーダルを、キューの内容で1件ずつ表示する
// ============================================
function processThemeConfirmQueue(queue) {
  if (queue.length === 0) return;
  const item = queue[0];
  const remaining = queue.slice(1);

  const existingTheme = activeThemes.find((t) => t.id === item.similarThemeId);
  const modal = document.getElementById("themeModal");
  const textEl = document.getElementById("themeModalText");

  if (existingTheme) {
    textEl.textContent = `このProblemは過去の「${existingTheme.name}」と同じテーマの可能性があります。`;
  } else {
    textEl.textContent = `このProblemは新しいテーマ「${item.newThemeNameSuggestion}」として記録できそうです。`;
  }

  modal.classList.add("visible");

  const sameBtn = document.getElementById("themeSameBtn");
  const diffBtn = document.getElementById("themeDiffBtn");
  const laterBtn = document.getElementById("themeLaterBtn");

  // 前回分のイベントが残らないよう、ボタンを複製して差し替える
  const newSameBtn = sameBtn.cloneNode(true);
  const newDiffBtn = diffBtn.cloneNode(true);
  const newLaterBtn = laterBtn.cloneNode(true);
  sameBtn.replaceWith(newSameBtn);
  diffBtn.replaceWith(newDiffBtn);
  laterBtn.replaceWith(newLaterBtn);

  function closeAndNext() {
    modal.classList.remove("visible");
    processThemeConfirmQueue(remaining);
  }

  newSameBtn.textContent = existingTheme ? "同じProblemにする" : "この名前で新規作成する";
  newSameBtn.addEventListener("click", async () => {
    if (existingTheme) {
      await linkProblemToExistingTheme(item.id, existingTheme.id);
    } else {
      await linkProblemToNewTheme(item.id, item.newThemeNameSuggestion, item.category, item.importance);
    }
    closeAndNext();
  });

  newDiffBtn.textContent = "別のProblemにする";
  newDiffBtn.addEventListener("click", async () => {
    if (existingTheme) {
      // 既存テーマとは別、ということなので新規テーマとして作成する
      const name = window.prompt("新しいテーマの名前を入力してください", item.newThemeNameSuggestion || "");
      if (name) {
        await linkProblemToNewTheme(item.id, name, item.category, item.importance);
      }
    }
    closeAndNext();
  });

  newLaterBtn.addEventListener("click", () => {
    closeAndNext();
  });
}

// 既存テーマにProblemを紐付け、発生回数などを更新する
async function linkProblemToExistingTheme(problemId, themeId) {
  const { data: theme } = await sb
    .from("problem_themes")
    .select("occurrence_count, first_occurrence")
    .eq("id", themeId)
    .single();

  await sb
    .from("problem_themes")
    .update({
      occurrence_count: (theme?.occurrence_count || 0) + 1,
      last_occurrence: todayStr,
      first_occurrence: theme?.first_occurrence || todayStr,
    })
    .eq("id", themeId);

  await sb
    .from("problem_instances")
    .update({ problem_theme_id: themeId, theme_confirm_status: "確定" })
    .eq("id", problemId);
}

// 新しいテーマを作り、Problemを紐付ける
async function linkProblemToNewTheme(problemId, name, category, importance) {
  const { data: newTheme, error } = await sb
    .from("problem_themes")
    .insert({
      name: name,
      category: category || null,
      importance: importance || "中",
      status: "未対応",
      occurrence_count: 1,
      first_occurrence: todayStr,
      last_occurrence: todayStr,
    })
    .select()
    .single();

  if (error) {
    console.error("新規テーマ作成エラー:", error);
    return;
  }

  await sb
    .from("problem_instances")
    .update({ problem_theme_id: newTheme.id, theme_confirm_status: "確定" })
    .eq("id", problemId);
}


// ============================================
// 保存後にフォームをリセット
// ============================================
function resetForm() {
  document.getElementById("keepInput").value = "";
  document.getElementById("tryInput").value = "";
  document.getElementById("fbInput").value = "";
  document.getElementById("problemList").innerHTML = "";
  problemBlockCount = 0;
  addProblemBlock();
  updateRelateVisibility();

  document.getElementById("followupSection").style.display = "none";
  document.getElementById("followupList").innerHTML = "";
  followupAnswers = {};
}


// ============================================
// 小さなユーティリティ
// ============================================
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2500);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
