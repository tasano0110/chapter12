import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export type CategoryOption =
  | "過去トラ"
  | "設計基準書"
  | "技術標準書"
  | "設計仕様書";

export type GeneratedMetadata = {
  title: string; // 例: スパークプラグ_設計基準書_日本自動車
  category: CategoryOption;
  summary: string; // 200-300文字程度、日本語
  productName?: string | null; // 抽出補助（保存はしないがタイトル生成に使用）
  customerName?: string | null; // 同上（提供先）
};

// OpenAI クライアントの初期化
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Supabase クライアント（署名付きURL生成用）
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = process.env.SUPABASE_BUCKET_DOCUMENTS || "document_files";

function trimToLength(text: string, max: number): string {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

/**
 * OpenAI Files APIを使ってPDFファイルをアップロードし、メタデータを生成
 *
 * PDFファイルを直接OpenAIにアップロードして解析します
 */
export async function generateDocumentMetadataFromFile(params: {
  fileName: string;
  storagePath: string;
}): Promise<GeneratedMetadata> {
  const { fileName, storagePath } = params;

  console.log(`[generateDocumentMetadataFromFile] 開始: ${fileName}`);

  // Supabaseからファイルをダウンロード
  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(storagePath);

  if (downloadError || !fileData) {
    throw new Error(
      `ファイルのダウンロードに失敗: ${downloadError?.message}`
    );
  }

  console.log(`[generateDocumentMetadataFromFile] ファイルダウンロード成功`);

  // BlobをBufferに変換
  const arrayBuffer = await fileData.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log(
    `[generateDocumentMetadataFromFile] ファイルサイズ: ${buffer.length} bytes`
  );

  // OpenAI Files APIにアップロード
  console.log(
    `[generateDocumentMetadataFromFile] OpenAI Files APIにアップロード中...`
  );

  const file = await openaiClient.files.create({
    file: new File([buffer], fileName, { type: "application/pdf" }),
    purpose: "assistants",
  });

  console.log(
    `[generateDocumentMetadataFromFile] ファイルアップロード成功: ${file.id}`
  );

  // Assistantを作成
  const assistant = await openaiClient.beta.assistants.create({
    name: "Document Metadata Extractor",
    instructions: `あなたは製造業の社内文書管理のアシスタントです。与えられたPDFドキュメントから以下を日本語で抽出・生成してください。

1) 品名（製品名）
2) 提供先（会社名等、顧客名、販売先など）
3) カテゴリー（次から厳密に1つ選択: 設計基準書, 過去トラ, 技術標準書, 設計仕様書）
4) サマリー（200文字から300文字程度。ファイル名、品名、提供先は含めない）

生成ルール:
- 出力は以下のJSON形式のみ。
- カテゴリーは上記4つの候補のいずれかに厳密一致。
- 品名/提供先が本文から不明な場合はnullを返す。
- サマリーは箇条書きにせず、1-2段落で要点を簡潔にまとめる。文字数は必ず200文字以上300文字以内にする。`,
    model: "gpt-4o-mini",
    tools: [{ type: "file_search" }],
  });

  // Threadを作成してファイルを添付
  const thread = await openaiClient.beta.threads.create({
    messages: [
      {
        role: "user",
        content: `ファイル名: ${fileName}\n\nこのPDFドキュメントを解析して、以下のJSON形式でメタデータを抽出してください:\n\n{\n  "productName": "品名 or null",\n  "customerName": "提供先 or null",\n  "category": "カテゴリー（設計基準書, 過去トラ, 技術標準書, 設計仕様書のいずれか）",\n  "summary": "サマリー（200-300文字）"\n}`,
        attachments: [
          {
            file_id: file.id,
            tools: [{ type: "file_search" }],
          },
        ],
      },
    ],
  });

  // Runを実行
  const run = await openaiClient.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
  });

  console.log(`[generateDocumentMetadataFromFile] Run完了: ${run.status}`);

  if (run.status !== "completed") {
    throw new Error(`OpenAI Run失敗: ${run.status}`);
  }

  // メッセージを取得
  const messages = await openaiClient.beta.threads.messages.list(thread.id);
  const lastMessage = messages.data[0];

  if (!lastMessage || lastMessage.role !== "assistant") {
    throw new Error("アシスタントからの応答がありません");
  }

  const textContent = lastMessage.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("テキストコンテンツが見つかりません");
  }

  const output = textContent.text.value;
  console.log(`[generateDocumentMetadataFromFile] OpenAI応答:`, output);

  // JSONを抽出（```json ... ``` で囲まれている可能性があるため）
  let jsonText = output;
  const jsonMatch = output.match(/```json\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1];
  }

  const parsed: {
    productName: string | null;
    customerName: string | null;
    category: CategoryOption;
    summary: string;
  } = JSON.parse(jsonText.trim());

  // クリーンアップ
  await openaiClient.files.delete(file.id);
  await openaiClient.beta.assistants.delete(assistant.id);

  const product = parsed?.productName?.trim() || null;
  const customer = parsed?.customerName?.trim() || null;

  // カテゴリーの安全化
  const CATEGORY_SET: Record<string, CategoryOption> = {
    過去トラ: "過去トラ",
    設計基準書: "設計基準書",
    技術標準書: "技術標準書",
    設計仕様書: "設計仕様書",
  };
  const normalizedCategory = CATEGORY_SET[parsed?.category ?? ""] ?? "設計基準書";

  // タイトル: 「品名_カテゴリー_提供先」形式（例: スパークプラグ_設計基準書_日本自動車）
  // 不明な項目は「不明」として表示
  const productPart = product || "不明";
  const customerPart = customer || "不明";
  const title = `${productPart}_${normalizedCategory}_${customerPart}`;

  // サマリー整形（200-300文字）
  const summary = trimToLength(parsed?.summary || "", 300);

  return {
    title,
    category: normalizedCategory,
    summary,
    productName: product,
    customerName: customer,
  };
}

/**
 * 旧バージョン: テキストベースのメタデータ生成（後方互換性のため残す）
 *
 * @deprecated generateDocumentMetadataFromFile を使用してください
 */
export async function generateDocumentMetadata(params: {
  fileName: string;
  text: string;
}): Promise<GeneratedMetadata> {
  const { fileName, text } = params;

  const systemPrompt = `あなたは製造業の社内文書管理のアシスタントです。与えられた本文から以下を日本語で抽出・生成してください。
1) 品名（製品名）
2) 提供先（会社名等、顧客名、販売先など）
3) カテゴリー（次から厳密に1つ選択: 設計基準書, 過去トラ, 技術標準書, 設計仕様書）
4) サマリー（200文字から300文字程度。ファイル名、品名、提供先は含めない）

生成ルール:
- 出力は以下のJSON形式のみ。他の説明文は不要。
- カテゴリーは上記4つの候補のいずれかに厳密一致。
- 品名/提供先が本文から不明な場合はnull。
- サマリーは箇条書きにせず、1-2段落で要点を簡潔にまとめる。文字数は必ず200文字以上300文字以内にする。

JSONフォーマット:
{
  "productName": "品名 or null",
  "customerName": "提供先 or null",
  "category": "カテゴリー",
  "summary": "サマリー"
}`;

  const userPrompt = `ファイル名: ${fileName}
本文:\n${trimToLength(text, 30000)}\n`;

  try {
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const output = response.choices[0]?.message?.content || "{}";
    const parsed: {
      productName: string | null;
      customerName: string | null;
      category: CategoryOption;
      summary: string;
    } = JSON.parse(output);

    const product = parsed?.productName?.trim() || null;
    const customer = parsed?.customerName?.trim() || null;

    // カテゴリーの安全化
    const CATEGORY_SET: Record<string, CategoryOption> = {
      過去トラ: "過去トラ",
      設計基準書: "設計基準書",
      技術標準書: "技術標準書",
      設計仕様書: "設計仕様書",
    };
    const normalizedCategory =
      CATEGORY_SET[parsed?.category ?? ""] ?? "設計基準書";

    // タイトル: 「品名_カテゴリー_提供先」形式（例: スパークプラグ_設計基準書_日本自動車）
    // 不明な項目は「不明」として表示
    const productPart = product || "不明";
    const customerPart = customer || "不明";
    const title = `${productPart}_${normalizedCategory}_${customerPart}`;

    // サマリー整形（200-300文字）
    const summary = trimToLength(parsed?.summary || "", 300);

    return {
      title,
      category: normalizedCategory,
      summary,
      productName: product,
      customerName: customer,
    };
  } catch (error) {
    console.error("OpenAI API error:", error);
    // フォールバック：最小限のデフォルト
    const baseName = fileName.replace(/\.[^.]+$/, "");
    return {
      title: `不明_設計基準書_不明`,
      category: "設計基準書",
      summary: "本文からの自動要約に失敗しました。ファイル名: " + baseName,
      productName: null,
      customerName: null,
    };
  }
}
