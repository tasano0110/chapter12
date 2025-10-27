import mammoth from "mammoth";

export type SupportedFileType = "pdf" | "docx" | "txt" | "md";

export function detectFileType(params: {
  storagePath: string;
  contentType: string | null;
}): SupportedFileType | null {
  const { storagePath, contentType } = params;
  const lower = storagePath.toLowerCase();

  if (lower.endsWith(".pdf") || contentType === "application/pdf") return "pdf";
  if (
    lower.endsWith(".docx") ||
    contentType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (lower.endsWith(".md") || contentType === "text/markdown") return "md";
  if (lower.endsWith(".txt") || (contentType?.startsWith("text/") ?? false))
    return "txt";

  return null;
}

type PdfJsModule = {
  getDocument: (args: unknown) => { promise: Promise<PdfJsDocument> };
  GlobalWorkerOptions?: { workerSrc?: unknown };
};
type PdfJsDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
};
type PdfJsPage = {
  getTextContent: (
    opts?: unknown
  ) => Promise<{ items?: Array<{ str?: string }> }>;
};

async function loadPdfJs(): Promise<PdfJsModule | null> {
  try {
    const mod = (await new Function(
      "return import('pdfjs-dist/legacy/build/pdf.js')"
    )()) as unknown as PdfJsModule | { default: PdfJsModule };
    const pdfjs: PdfJsModule = (mod as PdfJsModule).getDocument
      ? (mod as PdfJsModule)
      : ((mod as { default: PdfJsModule }).default as PdfJsModule);
    try {
      if (pdfjs?.GlobalWorkerOptions)
        pdfjs.GlobalWorkerOptions.workerSrc = undefined;
    } catch {}
    return pdfjs;
  } catch {
    try {
      const mod2 = (await new Function(
        "return import('pdfjs-dist/build/pdf.js')"
      )()) as unknown as PdfJsModule | { default: PdfJsModule };
      const pdfjs2: PdfJsModule = (mod2 as PdfJsModule).getDocument
        ? (mod2 as PdfJsModule)
        : ((mod2 as { default: PdfJsModule }).default as PdfJsModule);
      try {
        if (pdfjs2?.GlobalWorkerOptions)
          pdfjs2.GlobalWorkerOptions.workerSrc = undefined;
      } catch {}
      return pdfjs2;
    } catch {
      return null;
    }
  }
}

async function extractPdfWithPdfParse(buffer: Buffer): Promise<string> {
  try {
    const mod = (await new Function("return import('pdf-parse')")()) as
      | {
          default?: (buf: Buffer, opts?: unknown) => Promise<{ text?: string }>;
        }
      | ((buf: Buffer, opts?: unknown) => Promise<{ text?: string }>);

    const parseFn = (
      typeof mod === "function" ? mod : (mod.default as unknown)
    ) as (buf: Buffer, opts?: unknown) => Promise<{ text?: string }>;

    const pdfjs = await loadPdfJs();
    if (!pdfjs) {
      console.log("[extractPdfWithPdfParse] pdfjsなしで実行");
      const res = await parseFn(buffer);
      return (res?.text ?? "").trim();
    }

    console.log("[extractPdfWithPdfParse] pdfjsありで実行");
    const renderOnce = async (disableCombine: boolean) => {
      const res = await parseFn(buffer, {
        pdfjs,
        pagerender: async (page: PdfJsPage) => {
          const content = await page.getTextContent({
            normalizeWhitespace: true,
            disableCombineTextItems: disableCombine,
          } as unknown);
          const strings: string[] = (content.items || [])
            .map((it: { str?: string }) =>
              typeof it?.str === "string" ? it.str : ""
            )
            .filter(Boolean);
          return strings
            .join(" ")
            .replace(/\s{2,}/g, " ")
            .trim();
        },
      } as unknown);
      return (res?.text ?? "").trim();
    };

    let text = await renderOnce(true);
    if (!text) text = await renderOnce(false);
    return text;
  } catch (error) {
    console.error("[extractPdfWithPdfParse] エラー:", error);
    return "";
  }
}

async function extractPdfWithPdfjs(
  buffer: Buffer,
  options?: { disableCombineTextItems?: boolean; normalizeWhitespace?: boolean }
): Promise<string> {
  try {
    const pdfjs = await loadPdfJs();
    if (!pdfjs?.getDocument) {
      console.error("[extractPdfWithPdfjs] pdfjsのロードに失敗");
      return "";
    }
    console.log("[extractPdfWithPdfjs] pdfjsロード成功、PDFドキュメント読み込み中...");
    const loadingTask = pdfjs.getDocument({
      data: buffer,
      isEvalSupported: true,
      useWorkerFetch: false,
      disableFontFace: false,
    });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages || 0;
    console.log(`[extractPdfWithPdfjs] PDFページ数: ${numPages}`);
    let full = "";
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent({
        normalizeWhitespace: options?.normalizeWhitespace ?? true,
        disableCombineTextItems: options?.disableCombineTextItems ?? true,
      });
      const strings: string[] = (content.items || [])
        .map((it) => (typeof it?.str === "string" ? it.str : ""))
        .filter(Boolean);
      const line = strings
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (line) full += line + "\n";
    }
    console.log(`[extractPdfWithPdfjs] 抽出完了: ${full.length}文字`);
    return full.trim();
  } catch (error) {
    console.error("[extractPdfWithPdfjs] エラー:", error);
    return "";
  }
}

export async function extractTextFromBuffer(params: {
  buffer: Buffer;
  type: SupportedFileType;
}): Promise<string> {
  const { buffer, type } = params;

  if (type === "pdf") {
    console.log("[text-extractor] PDF抽出開始");

    // 1) pdf-parse（pagerender true/false の二段）
    console.log("[text-extractor] 方法1: pdf-parseを試行中...");
    const primary = await extractPdfWithPdfParse(buffer);
    if (primary) {
      console.log(`[text-extractor] pdf-parseで抽出成功: ${primary.length}文字`);
      return primary;
    }
    console.log("[text-extractor] pdf-parseでの抽出失敗");

    // 2) pdfjs-dist 直接（disableCombine true → false）
    console.log("[text-extractor] 方法2: pdfjs-dist(disableCombine=true)を試行中...");
    let text = await extractPdfWithPdfjs(buffer, {
      disableCombineTextItems: true,
    });
    if (text) {
      console.log(`[text-extractor] pdfjs-dist(disableCombine=true)で抽出成功: ${text.length}文字`);
      return text;
    }
    console.log("[text-extractor] pdfjs-dist(disableCombine=true)での抽出失敗");

    console.log("[text-extractor] 方法3: pdfjs-dist(disableCombine=false)を試行中...");
    text = await extractPdfWithPdfjs(buffer, {
      disableCombineTextItems: false,
    });
    if (text) {
      console.log(`[text-extractor] pdfjs-dist(disableCombine=false)で抽出成功: ${text.length}文字`);
      return text;
    }
    console.log("[text-extractor] pdfjs-dist(disableCombine=false)での抽出失敗");

    // 3) 最終フォールバック: utf8 直読（危険：バイナリデータを読む可能性）
    console.warn("[text-extractor] 警告: すべての適切な方法で抽出失敗。フォールバックは使用しません。");
    // フォールバックを無効化（バイナリデータを読まないようにする）
    // try {
    //   const fallback = buffer.toString("utf8").trim();
    //   if (fallback) return fallback;
    // } catch {}
    return "";
  }

  if (type === "docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    return value ?? "";
  }

  // txt / md
  return buffer.toString("utf8");
}

export function cleanExtractedText(text: string): string {
  return (text || "")
    .replace(/[\r\t]+/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \u3000]{2,}/g, " ")
    .trim();
}

/**
 * OpenAI APIを使ってPDFファイルから全文テキストを抽出
 *
 * PDFライブラリが壊れているため、OpenAI Assistants APIを使用してテキストを抽出します
 */
export async function extractPdfTextWithOpenAI(params: {
  storagePath: string;
}): Promise<string> {
  const { storagePath } = params;

  console.log(`[extractPdfTextWithOpenAI] 開始: ${storagePath}`);

  // 動的インポート（サーバーサイドでのみ使用）
  const OpenAI = (await import("openai")).default;
  const { createClient } = await import("@supabase/supabase-js");

  const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const BUCKET = process.env.SUPABASE_BUCKET_DOCUMENTS || "document_files";

  // Supabaseからファイルをダウンロード
  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(storagePath);

  if (downloadError || !fileData) {
    throw new Error(
      `ファイルのダウンロードに失敗: ${downloadError?.message}`
    );
  }

  console.log(`[extractPdfTextWithOpenAI] ファイルダウンロード成功`);

  // BlobをBufferに変換
  const arrayBuffer = await fileData.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const fileName = storagePath.split("/").pop() || "document.pdf";
  console.log(
    `[extractPdfTextWithOpenAI] ファイルサイズ: ${buffer.length} bytes, ファイル名: ${fileName}`
  );

  // OpenAI Files APIにアップロード
  console.log(`[extractPdfTextWithOpenAI] OpenAI Files APIにアップロード中...`);

  const file = await openaiClient.files.create({
    file: new File([buffer], fileName, { type: "application/pdf" }),
    purpose: "assistants",
  });

  console.log(`[extractPdfTextWithOpenAI] ファイルアップロード成功: ${file.id}`);

  // Assistantを作成
  const assistant = await openaiClient.beta.assistants.create({
    name: "PDF Text Extractor",
    instructions: `あなたはPDFファイルから全文を抽出する専門家です。

【最重要ルール】
- PDFの全ページ（1ページ目から最終ページまで）のテキストを1文字も省略せず、すべて出力してください
- 要約は絶対に行わないでください。全文をそのまま書き写してください
- 「このPDFには○○が書かれています」のような説明は不要です。内容だけを出力してください
- 各ページの内容を順番に出力してください

【出力形式】
- フォーマットや構造を保持してください（見出し、段落、箇条書きなど）
- 図表のキャプションや注釈も含めてください
- ページ番号やヘッダー/フッターは省略してもよい
- テキストが長くても、必ず全文を出力してください

【言語】
- 日本語と英語が混在する可能性があります。元の言語のまま出力してください`,
    model: "gpt-4o",
    tools: [{ type: "file_search" }],
  });

  // Threadを作成してファイルを添付
  const thread = await openaiClient.beta.threads.create({
    messages: [
      {
        role: "user",
        content: `このPDFファイルの全ページの内容を、1ページ目から最終ページまで、すべてのテキストを1文字も省略せずに出力してください。

要約や説明は不要です。PDFに書かれているテキストをそのまま、全文書き写してください。

ページが多い場合でも、必ずすべてのページの内容を出力してください。途中で省略しないでください。`,
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

  console.log(`[extractPdfTextWithOpenAI] Run完了: ${run.status}`);

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

  const extractedText = textContent.text.value;
  console.log(`[extractPdfTextWithOpenAI] テキスト抽出完了: ${extractedText.length}文字`);

  // クリーンアップ
  await openaiClient.files.delete(file.id);
  await openaiClient.beta.assistants.delete(assistant.id);

  return extractedText;
}
