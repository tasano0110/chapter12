import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

// このルートはバイナリ処理（PDF/DOCX 解析）を行うため Node.js ランタイムで実行
export const runtime = "nodejs";
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
 * POST /api/documents/[id]/generate-metadata
 * ドキュメントのファイルからメタデータ（タイトル、カテゴリ、サマリー）を自動生成
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  console.log(`[generate-metadata] リクエスト受信: documentId=${id}`);

  try {
    // 認証チェック
    const token = getBearerToken(req);
    const userId = await getUserIdFromToken(token);
    console.log(`[generate-metadata] 認証チェック: userId=${userId}`);
    if (!userId) {
      console.error("[generate-metadata] 認証エラー: ユーザーが認証されていません");
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // ドキュメントの取得
    console.log(`[generate-metadata] ドキュメント検索中: id=${id}`);
    const doc = await prisma.document.findUnique({
      where: { id },
      include: {
        category: true,
      },
    });

    if (!doc) {
      console.error(`[generate-metadata] ドキュメントが見つかりません: id=${id}`);
      return NextResponse.json(
        { message: "Document not found" },
        { status: 404 }
      );
    }

    console.log(`[generate-metadata] ドキュメント見つかりました: title=${doc.title}, storagePath=${doc.storagePath}`);

    // 所有者チェック
    if (doc.createdById !== userId) {
      console.error(`[generate-metadata] 権限エラー: doc.createdById=${doc.createdById}, userId=${userId}`);
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    // Storageからファイルをダウンロード
    console.log(`[generate-metadata] ファイルダウンロード開始: bucket=${BUCKET}, path=${doc.storagePath}`);
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(doc.storagePath);

    if (downloadError || !fileData) {
      console.error(`[generate-metadata] ファイルダウンロード失敗:`, downloadError);
      return NextResponse.json(
        {
          message: "Failed to download file from storage",
          detail: downloadError?.message,
        },
        { status: 500 }
      );
    }

    console.log(`[generate-metadata] ファイルダウンロード成功`);

    // ファイルタイプを検出
    const { detectFileType } = await import("@/mastra/services/text-extractor");
    const fileType = detectFileType({
      storagePath: doc.storagePath,
      contentType: (fileData as unknown as { type?: string })?.type ?? null,
    });

    console.log(`[generate-metadata] ファイルタイプ検出: ${fileType}`);

    if (!fileType) {
      console.error(`[generate-metadata] サポートされていないファイル形式`);
      return NextResponse.json(
        {
          message: "Unsupported Media Type",
          detail:
            "このファイル形式は現在未対応です（PDF/DOCX/TXT/MD をサポート）。",
        },
        { status: 415 }
      );
    }

    const fileName =
      doc.storagePath.split("/").pop() || doc.title || "document";
    console.log(`[generate-metadata] ファイル名: ${fileName}`);

    // PDFの場合は、OpenAIに直接ファイルを送る（テキスト抽出不要）
    if (fileType === "pdf") {
      console.log(`[generate-metadata] PDF検出: OpenAIに直接送信します`);

      const { generateDocumentMetadataFromFile } = await import(
        "@/mastra/services/metadata-generator"
      );

      try {
        const metadata = await generateDocumentMetadataFromFile({
          fileName,
          storagePath: doc.storagePath,
        });

        console.log(`[generate-metadata] メタデータ生成成功:`, {
          title: metadata.title,
          category: metadata.category,
          summaryLength: metadata.summary?.length || 0,
        });

        return NextResponse.json(
          {
            message: "Metadata generated successfully",
            data: {
              title: metadata.title,
              category: metadata.category,
              summary: metadata.summary,
            },
          },
          { status: 200 }
        );
      } catch (error) {
        console.error(`[generate-metadata] PDF処理エラー:`, error);
        return NextResponse.json(
          {
            message: "Failed to process PDF",
            detail: error instanceof Error ? error.message : String(error),
          },
          { status: 500 }
        );
      }
    }

    // PDF以外の場合は従来のテキスト抽出方式
    console.log(`[generate-metadata] テキスト抽出開始（非PDF）`);
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`[generate-metadata] ファイルサイズ: ${buffer.length} bytes`);

    const { extractTextFromBuffer, cleanExtractedText } = await import(
      "@/mastra/services/text-extractor"
    );

    const rawText = await extractTextFromBuffer({ buffer, type: fileType });
    const text = cleanExtractedText(rawText);
    console.log(`[generate-metadata] テキスト抽出完了: ${text.length} 文字`);

    if (!text || text.length < 1) {
      console.error(`[generate-metadata] テキスト抽出に失敗`);
      return NextResponse.json(
        {
          message: "Unprocessable Entity",
          detail:
            "テキスト抽出に失敗しました。ファイルの内容を確認してください。",
        },
        { status: 422 }
      );
    }

    // メタデータ生成
    console.log(`[generate-metadata] AIメタデータ生成開始`);
    const { generateDocumentMetadata } = await import(
      "@/mastra/services/metadata-generator"
    );

    const metadata = await generateDocumentMetadata({
      fileName,
      text,
    });

    console.log(`[generate-metadata] メタデータ生成成功:`, {
      title: metadata.title,
      category: metadata.category,
      summaryLength: metadata.summary?.length || 0,
    });

    return NextResponse.json(
      {
        message: "Metadata generated successfully",
        data: {
          title: metadata.title,
          category: metadata.category,
          summary: metadata.summary,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("[generate-metadata] エラーが発生しました:", error);
    return NextResponse.json(
      {
        message: "Failed to generate metadata",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
