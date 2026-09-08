// このファイルは、ブラウザからは直接見えない「Vercelのサーバー内」で動きます。
// Gemini APIキーはここでだけ使われ、アプリのコードには一切出てきません。

module.exports = async function handler(req, res) {
  // POST以外は受け付けない
  if (req.method !== "POST") {
    res.status(405).json({ error: "POSTだけ受け付けています" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "サーバーにGEMINI_API_KEYが設定されていません" });
    return;
  }

  const { date, keep, problems, tryText, fbText, activeThemes } = req.body || {};

  // ============================================
  // AIに送るプロンプトを組み立てる
  // ============================================
  const themeListText =
    activeThemes && activeThemes.length > 0
      ? activeThemes.map((t) => `- id:${t.id} 名前:${t.name}`).join("\n")
      : "(まだ登録されているテーマはありません)";

  const problemListText =
    problems && problems.length > 0
      ? problems.map((p) => `- id:${p.id} 内容:${p.text}`).join("\n")
      : "(今日はProblemの入力なし)";

  const prompt = `
あなたは、仕事の成長を長期的に記録するアプリのAI分析役です。
ユーザーを過剰に褒めず、証拠に基づいて客観的かつ冷静に、しかし言葉遣いは柔らかく分析してください。
証拠が不十分な場合は「まだ判断できない」と正直に述べてください。

# 今日の記録(${date})
Keep: ${keep || "(なし)"}
Try: ${tryText || "(なし)"}
FB: ${fbText || "(なし)"}

# 今日発生したProblem
${problemListText}

# 既存の長期Problemテーマ一覧
${themeListText}

# 依頼内容
1. 各Problemについて、category(例:仕様理解/テスト設計/レビュー/報連相/コミュニケーション/作業スピード/問題解決/その他)とimportance(高/中/低)を提案してください。
2. 各Problemが、既存テーマ一覧の中のどれかと似ている場合はそのidをsimilarThemeIdに、確信度をsimilarThemeConfidence(高/中/低)で示してください。似ているテーマが無ければsimilarThemeIdはnullにしてください。
3. 似たテーマが無く、かつこのProblemが繰り返されそうな重要なものだと感じた場合は、newThemeNameSuggestionに短いテーマ名の案を入れてください(不要ならnull)。
4. 今日の記録全体を踏まえた短い日次分析コメント(dailyAnalysis)を3〜4文で書いてください。事実→分析→次の示唆、という順番にしてください。
5. 今日または明日「意識するとよいこと」を1つだけ選び、focusOfTheDaySuggestionとして一文で提案してください。

# 出力形式
説明文やMarkdownの記号を一切付けず、以下のJSON形式のみを出力してください。

{
  "problemClassifications": [
    {
      "id": "(入力で渡されたid)",
      "category": "string",
      "importance": "高|中|低",
      "similarThemeId": "string または null",
      "similarThemeConfidence": "高|中|低",
      "newThemeNameSuggestion": "string または null"
    }
  ],
  "dailyAnalysis": "string",
  "focusOfTheDaySuggestion": "string"
}
`.trim();

  try {
    const model = "gemini-flash-latest";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const requestBody = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    // Geminiが混雑している(503)場合、間隔をあけながら最大2回まで再試行する
    async function callGemini() {
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
    }

    let geminiRes = await callGemini();
    const retryDelaysMs = [1500, 3500];
    for (let i = 0; geminiRes.status === 503 && i < retryDelaysMs.length; i++) {
      await new Promise((r) => setTimeout(r, retryDelaysMs[i]));
      geminiRes = await callGemini();
    }

    if (!geminiRes.ok) {
      if (geminiRes.status === 503) {
        res.status(502).json({
          error: "Geminiが混雑しています。数分待ってからもう一度保存してみてください。",
        });
        return;
      }
      const errText = await geminiRes.text();
      res.status(502).json({ error: "Gemini APIエラー: " + errText });
      return;
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      res.status(502).json({ error: "AIから有効な応答がありませんでした" });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      res.status(502).json({ error: "AIの応答をJSONとして解釈できませんでした: " + rawText });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: "サーバー内でエラーが発生しました: " + err.message });
  }
};
