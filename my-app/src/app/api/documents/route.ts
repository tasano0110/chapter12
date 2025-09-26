// src/app/api/documents/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";

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
// multipart/form-data: file, title, category?, summary?
// ------------------------
export async function POST(req: NextRequest) {
  // 認証
  const authResult = await requireUserId(req);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string | null)?.trim();
    const category =
      (formData.get("category") as string | null)?.trim() || null;
    const summary = (formData.get("summary") as string | null)?.trim() || null;
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
    if (!title) {
      return NextResponse.json(
        { message: "title は必須です" },
        { status: 400 }
      );
    }
    // category は任意に緩和（クライアント仕様に合わせて変更）

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
    const metadata =
      sbUserData?.user?.user_metadata as Record<string, unknown> | undefined;
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

    // --- Category の解決（名前で find-or-create） ---
    const resolvedCategoryName =
      category && category.trim().length > 0 ? category.trim() : "未分類";
    const existedCategory = await prisma.category.findUnique({
      where: { name: resolvedCategoryName },
    });
    const categoryId = existedCategory
      ? existedCategory.id
      : (await prisma.category.create({ data: { name: resolvedCategoryName } }))
          .id;

    // --- DB 登録 ---
    const doc = await prisma.document.create({
      data: {
        createdById: userId,
        categoryId,
        title,
        summary,
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
      data: data.map((d) => ({
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
