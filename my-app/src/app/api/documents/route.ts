// src/app/api/documents/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";
import { ensureBucketExistsAdmin } from "@/utils/ensureBucket";

// Node で動かしてバッファを扱う
export const runtime = "nodejs";

const prisma = new PrismaClient();

// --- Supabase: server-side (Storage用) ---
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Service Role（必須: Storage 書き込み）
);

// 必要に応じて .env で変更（デフォルトを `document_files` に統一）
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
  // 任意のキーでOK（anonでも可）。ここでは admin クライアントを流用
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user.id;
}

/** 共通: 認証ガード（未ログイン時 401） */
async function requireUserId(req: NextRequest): Promise<string | NextResponse> {
  const token = getBearerToken(req);
  const userId = await getUserIdFromToken(token);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  return userId;
}

/** ファイル名用のID */
function generateObjectNameExtensionAware(originalName: string) {
  const ext = originalName.includes(".")
    ? originalName.split(".").pop()
    : undefined;
  return `${Date.now()}_${uuidv4()}${ext ? "." + ext : ""}`;
}

// ------------------------
// POST /api/documents
// multipart/form-data: file[, storagePath]
// ------------------------
export async function POST(req: NextRequest) {
  // 認証
  const authResult = await requireUserId(req);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    // 事前アップロード済みの Storage パス（クライアント側で Storage に置いた場合）
    const preUploadedPath =
      (formData.get("storagePath") as string | null)?.trim() || null;

    // file または storagePath のどちらかは必須
    if (!file && !preUploadedPath) {
      return NextResponse.json(
        { message: "file か storagePath のいずれかが必須です" },
        { status: 400 }
      );
    }
    // メタデータはサーバー側で自動生成するため、title/category/summary は不要

    // 事前アップロードがあればそれを採用。なければサーバーでアップロード
    let objectPath: string;
    if (preUploadedPath) {
      objectPath = preUploadedPath;
    } else {
      if (!file) {
        return NextResponse.json(
          { message: "file は必須です" },
          { status: 400 }
        );
      }
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileName = generateObjectNameExtensionAware(file.name);
      objectPath = `${userId}/${fileName}`;

      const { error: upErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(objectPath, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (upErr) {
        return NextResponse.json(
          { message: "Storage upload 失敗", detail: upErr.message },
          { status: 500 }
        );
      }
    }

    // --- ユーザーの存在をアプリDBで保証（Supabase Auth と同期） ---
    const token = getBearerToken(req);
    const { data: sbUserData } = await supabaseAdmin.auth.getUser(token ?? "");
    const userEmail = sbUserData?.user?.email || `${userId}@local.invalid`;
    const metadata = sbUserData?.user?.user_metadata as
      | Record<string, unknown>
      | undefined;
    const displayName =
      metadata && typeof metadata.name === "string" ? metadata.name : null;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: userEmail,
        ...(displayName ? { displayName } : {}),
      },
    });

    // --- ファイルタイプを検出してメタデータを生成 ---
    await ensureBucketExistsAdmin(supabaseAdmin, BUCKET);

    const { detectFileType } = await import("@/mastra/services/text-extractor");

    // ファイルタイプを判定（ダウンロードは不要）
    const fileType = detectFileType({
      storagePath: objectPath,
      contentType: file?.type ?? null,
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

    const fileName = (
      file?.name ||
      objectPath.split("/").pop() ||
      "document"
    ).toString();

    console.log(`[POST /api/documents] ファイルタイプ: ${fileType}, ファイル名: ${fileName}`);

    let inferred;
    let extractedText = ""; // RAG処理用のテキスト

    // PDFの場合はOpenAI Assistants APIを使用
    if (fileType === "pdf") {
      console.log(`[POST /api/documents] PDF検出: OpenAI Assistants APIで処理`);
      const { generateDocumentMetadataFromFile } = await import(
        "@/mastra/services/metadata-generator"
      );
      inferred = await generateDocumentMetadataFromFile({
        fileName,
        storagePath: objectPath,
      });

      // RAG処理用にテキストも抽出
      console.log(`[POST /api/documents] PDF: RAG用テキスト抽出開始`);
      const { extractPdfTextWithOpenAI, cleanExtractedText } = await import(
        "@/mastra/services/text-extractor"
      );
      const rawText = await extractPdfTextWithOpenAI({
        storagePath: objectPath,
      });
      extractedText = cleanExtractedText(rawText);
      console.log(`[POST /api/documents] PDF: RAG用テキスト抽出完了（${extractedText.length}文字）`);
    } else {
      // PDF以外の場合は従来のテキスト抽出方式
      console.log(`[POST /api/documents] 非PDF: テキスト抽出方式で処理`);

      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .download(objectPath);

      if (downloadError || !fileData) {
        return NextResponse.json(
          {
            message: "Failed to download file from storage",
            detail: downloadError?.message,
          },
          { status: 500 }
        );
      }

      const arrayBuffer2 = await fileData.arrayBuffer();
      const buffer2 = Buffer.from(arrayBuffer2);

      const { extractTextFromBuffer, cleanExtractedText } = await import(
        "@/mastra/services/text-extractor"
      );

      const rawText = await extractTextFromBuffer({
        buffer: buffer2,
        type: fileType,
      });
      const text = cleanExtractedText(rawText);
      extractedText = text; // RAG処理用に保存

      const { generateDocumentMetadata } = await import(
        "@/mastra/services/metadata-generator"
      );
      inferred = await generateDocumentMetadata({
        fileName,
        text,
      });
    }

    console.log(`[POST /api/documents] メタデータ生成完了: ${inferred.title}`);

    // --- Category の解決（名前で find-or-create） ---
    const existedCategory = await prisma.category.findUnique({
      where: { name: inferred.category },
    });
    const categoryId = existedCategory
      ? existedCategory.id
      : (await prisma.category.create({ data: { name: inferred.category } }))
          .id;

    // --- DB 登録 ---
    const doc = await prisma.document.create({
      data: {
        createdById: userId,
        categoryId,
        title: inferred.title,
        summary: inferred.summary,
        uploadedAt: new Date(),
        storagePath: objectPath,
      },
      select: {
        id: true,
        title: true,
        category: { select: { name: true } },
        summary: true,
        uploadedAt: true,
      },
    });

    console.log(`[POST /api/documents] ドキュメント作成完了: ${doc.id}`);

    // --- RAG処理を自動実行 ---
    if (extractedText && extractedText.length > 0) {
      console.log(`[POST /api/documents] RAG処理開始: ${doc.id}`);
      try {
        const { processDocument } = await import(
          "@/mastra/services/document-processor"
        );
        await processDocument({
          documentId: doc.id,
          text: extractedText,
          metadata: {
            title: doc.title,
            category: doc.category?.name,
            userId,
          },
        });
        console.log(`[POST /api/documents] RAG処理完了: ${doc.id}`);
      } catch (ragError) {
        // RAG処理が失敗してもドキュメント作成は成功扱いにする
        console.error(`[POST /api/documents] RAG処理エラー:`, ragError);
      }
    } else {
      console.log(`[POST /api/documents] テキストが空のためRAG処理をスキップ`);
    }

    return NextResponse.json({ data: doc }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        message: "サーバーエラー",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

// ------------------------
// GET /api/documents?limit=20&cursor=<id>
// ユーザー本人のドキュメントのみ返す（降順）
// cursor は "id" ベースのシンプル実装（本番は createdAt + id の複合など推奨）
// ------------------------
export async function GET(req: NextRequest) {
  // 認証
  const authResult = await requireUserId(req);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult;

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") ?? "20"), 1),
      50
    );
    const cursor = searchParams.get("cursor") || undefined;

    const where = { createdById: userId };
    const orderBy = { uploadedAt: "desc" as const };

    // Prisma cursor pagination（idではなく uploadedAt の方が直感的な場合も）
    const docs = await prisma.document.findMany({
      where,
      orderBy,
      take: limit + 1, // 1件余分に取って next の有無を判定
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        summary: true,
        category: { select: { name: true } },
        uploadedAt: true,
      },
    });

    let nextCursor: string | null = null;
    let data = docs;

    if (docs.length > limit) {
      const last = docs[docs.length - 1];
      nextCursor = last.id;
      data = docs.slice(0, limit);
    }

    // prevCursor は簡易対応（必要なら実装）
    return NextResponse.json({
      data: data.map((d: typeof docs[number]) => ({
        id: d.id,
        title: d.title,
        summary: d.summary,
        category: d.category?.name ?? null,
        uploadedAt: d.uploadedAt?.toISOString() ?? null,
      })),
      nextCursor,
      prevCursor: null,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        message: "サーバーエラー",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
