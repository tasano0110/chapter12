import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { processDocument } from "@/mastra/services/document-processor";

// このルートはバイナリ処理（PDF/DOCX 解析）を行うため Node.js ランタイムで実行
export const runtime = "nodejs";
// 動的に実行（静的最適化の誤判定を避けるため）
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = process.env.SUPABASE_BUCKET_DOCUMENTS || "document_files";

/** Authorization ヘッダの "Bearer <token>" を取り出す */
function getBearerToken(req: NextRequest): string | null {
  const auth =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/** アクセストークン → SupabaseユーザーID を取得 */
async function getUserIdFromToken(
  accessToken: string | null
): Promise<string | null> {
  if (!accessToken) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * POST /api/documents/[id]/process
 * ドキュメントをダウンロードしてRAG処理（チャンク化 + エンベディング + ベクトルストア保存）
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return handleProcess(req, params);
}

// 一部環境で GET が飛ぶケースに備えて、同処理を許容（本来は POST を推奨）
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return handleProcess(req, params);
}

async function handleProcess(req: NextRequest, { id }: { id: string }) {
  try {
    // 認証チェック
    const token = getBearerToken(req);
    const userId = await getUserIdFromToken(token);
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // ドキュメントの取得
    const doc = await prisma.document.findUnique({
      where: { id },
      include: {
        category: true,
      },
    });

    if (!doc) {
      return NextResponse.json(
        { message: "Document not found" },
        { status: 404 }
      );
    }

    // 所有者チェック
    if (doc.createdById !== userId) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    // Storageからファイルをダウンロード
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(doc.storagePath);

    if (downloadError || !fileData) {
      return NextResponse.json(
        {
          message: "Failed to download file from storage",
          detail: downloadError?.message,
        },
        { status: 500 }
      );
    }

    // ファイルをテキストに変換（拡張子/Content-Type に応じた抽出）
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 重い依存を含む抽出ユーティリティは動的インポートで読み込む
    const { detectFileType, extractTextFromBuffer, cleanExtractedText } =
      await import("@/mastra/services/text-extractor");

    const fileType = detectFileType({
      storagePath: doc.storagePath,
      // Blob の type をヒントとして使用（無い場合もある）
      contentType: (fileData as unknown as { type?: string })?.type ?? null,
    });

    if (!fileType) {
      return NextResponse.json(
        {
          message: "Unsupported Media Type",
          detail:
            "このファイル形式は現在未対応です（PDF/DOCX/TXT/MD をサポート）。",
        },
        { status: 415 }
      );
    }

    console.log(`[process] ファイルタイプ: ${fileType}`);

    let text: string;

    // PDFの場合はOpenAI APIを使ってテキスト抽出
    if (fileType === "pdf") {
      console.log(`[process] PDF検出: OpenAI APIでテキスト抽出`);
      const { extractPdfTextWithOpenAI } = await import(
        "@/mastra/services/text-extractor"
      );
      try {
        const rawText = await extractPdfTextWithOpenAI({
          storagePath: doc.storagePath,
        });
        text = cleanExtractedText(rawText);
        console.log(`[process] PDF抽出成功: ${text.length}文字`);
      } catch (error) {
        console.error(`[process] PDFテキスト抽出エラー:`, error);
        return NextResponse.json(
          {
            message: "PDF text extraction failed",
            detail:
              error instanceof Error ? error.message : "PDFからテキストを抽出できませんでした",
          },
          { status: 500 }
        );
      }
    } else {
      // PDF以外は従来の方法
      console.log(`[process] 非PDF: 従来のテキスト抽出方式`);
      const rawText = await extractTextFromBuffer({ buffer, type: fileType });
      text = cleanExtractedText(rawText);
    }

    if (!text || text.length < 1) {
      return NextResponse.json(
        {
          message: "Unprocessable Entity",
          detail:
            "テキスト抽出に失敗しました。ファイルの内容を確認してください。",
        },
        { status: 422 }
      );
    }

    console.log(`[process] テキスト抽出完了: ${text.length}文字、RAG処理開始`);

    // RAG処理: ドキュメントをチャンク化してベクトル化
    const result = await processDocument({
      documentId: doc.id,
      text,
      metadata: {
        title: doc.title,
        category: doc.category?.name,
        userId,
      },
    });

    return NextResponse.json(
      {
        message: "Document processed successfully",
        data: result,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Document processing error:", error);
    return NextResponse.json(
      {
        message: "Failed to process document",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
