import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

// Node で動かしてバッファ/署名URLなど扱う
export const runtime = "nodejs";

const prisma = new PrismaClient();

// --- Supabase: server-side (Auth検証 & Storage操作用) ---
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// .env（デフォルトを `document_files` に統一）
const BUCKET = process.env.SUPABASE_BUCKET_DOCUMENTS || "document_files";
// private バケットでもプレビュー可能にするため、デフォルトで署名URLを発行（秒数）
const SIGNED_URL_SECONDS = Number(
  process.env.SUPABASE_SIGNED_URL_SECONDS ?? "3600"
); // 例: 3600（0 を明示設定すれば公開URLを返す）

/** Authorization ヘッダから Bearer トークン */
function getBearerToken(req: NextRequest): string | null {
  const auth =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/** アクセストークン → SupabaseユーザーID */
async function getUserIdFromToken(
  accessToken: string | null
): Promise<string | null> {
  if (!accessToken) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user.id;
}

/** 共通：未認証なら 401 */
async function requireUserId(req: NextRequest): Promise<string | NextResponse> {
  const token = getBearerToken(req);
  const userId = await getUserIdFromToken(token);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  return userId;
}

/** 共通：存在チェック（本人のものだけ見つかる） */
async function findOwnDocumentOr404(id: string, userId: string) {
  const doc = await prisma.document.findFirst({
    where: { id, createdById: userId },
    select: {
      id: true,
      title: true,
      summary: true,
      category: true,
      uploadedAt: true,
      storagePath: true, // 削除や署名URL生成に使用
    },
  });
  if (!doc) {
    return NextResponse.json({ message: "Not Found" }, { status: 404 });
  }
  return doc;
}

// ------------------------
// GET /api/documents/[id]
// ------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireUserId(req);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult;
  const id = params.id;

  try {
    const docOrRes = await findOwnDocumentOr404(id, userId);
    if (docOrRes instanceof NextResponse) return docOrRes;
    const doc = docOrRes;

    // private 運用なら署名URLを生成して返す（SIGNED_URL_SECONDS > 0 のとき）
    let fileUrl: string | null = null;
    if (doc.storagePath) {
      if (SIGNED_URL_SECONDS > 0) {
        const { data, error } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(doc.storagePath, SIGNED_URL_SECONDS);
        if (!error && data?.signedUrl) {
          fileUrl = data.signedUrl;
        }
      } else {
        const { data } = supabaseAdmin.storage
          .from(BUCKET)
          .getPublicUrl(doc.storagePath);
        fileUrl = data.publicUrl ?? null;
      }
    }

    return NextResponse.json({
      data: {
        id: doc.id,
        title: doc.title,
        category: doc.category?.name ?? null,
        summary: doc.summary,
        storagePath: doc.storagePath,
        uploadedAt: doc.uploadedAt?.toISOString() ?? null,
        fileUrl,
      },
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

// ------------------------
// PATCH /api/documents/[id]
// body: JSON { title?, category?, summary? }
// （※ファイル差し替えは最小実装では未対応）
// ------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireUserId(req);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult;
  const id = params.id;

  try {
    const payload = await req.json().catch(() => ({}));
    const updateData: Record<string, unknown> = {};

    if (typeof payload.title === "string") {
      const t = payload.title.trim();
      if (t.length === 0) {
        return NextResponse.json(
          { message: "title を空にはできません" },
          { status: 400 }
        );
      }
      updateData.title = t;
    }
    if (typeof payload.category === "string") {
      const rawCategory = payload.category.trim();
      const resolvedCategoryName =
        rawCategory.length > 0 ? rawCategory : "未分類";
      const existedCategory = await prisma.category.findUnique({
        where: { name: resolvedCategoryName },
      });
      const categoryId = existedCategory
        ? existedCategory.id
        : (
            await prisma.category.create({
              data: { name: resolvedCategoryName },
            })
          ).id;
      updateData.categoryId = categoryId;
    }
    if (typeof payload.summary === "string") {
      updateData.summary = payload.summary.trim() || null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { message: "更新項目がありません" },
        { status: 400 }
      );
    }

    // 本人のレコードだけ更新
    const updated = await prisma.document.updateMany({
      where: { id, createdById: userId },
      data: updateData,
    });

    if (updated.count === 0) {
      // 存在しない or 他人のドキュメント
      return NextResponse.json({ message: "Not Found" }, { status: 404 });
    }

    // 最新を返す
    const latest = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        category: true,
        summary: true,
        storagePath: true,
        uploadedAt: true,
      },
    });

    let fileUrl: string | null = null;
    if (latest?.storagePath) {
      if (SIGNED_URL_SECONDS > 0) {
        const { data, error } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(latest.storagePath, SIGNED_URL_SECONDS);
        if (!error && data?.signedUrl) {
          fileUrl = data.signedUrl;
        }
      } else {
        const { data } = supabaseAdmin.storage
          .from(BUCKET)
          .getPublicUrl(latest.storagePath);
        fileUrl = data.publicUrl ?? null;
      }
    }

    return NextResponse.json({
      data: {
        id: latest?.id ?? id,
        title: latest?.title ?? updateData.title,
        category: latest?.category?.name ?? null,
        summary: latest?.summary ?? updateData.summary ?? null,
        storagePath: latest?.storagePath ?? null,
        uploadedAt: latest?.uploadedAt?.toISOString() ?? null,
        fileUrl,
      },
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

// ------------------------
// DELETE /api/documents/[id]
// Storage の実ファイルも削除（存在しなくてもOK扱い）
// ------------------------
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireUserId(req);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult;
  const id = params.id;

  try {
    // 本人レコードの取得（filePath 取得のため）
    const docOrRes = await findOwnDocumentOr404(id, userId);
    if (docOrRes instanceof NextResponse) return docOrRes;
    const doc = docOrRes;

    // 先に DB を消す（競合を避けるなら順序はどちらでもOK）
    await prisma.document.delete({
      where: { id },
    });

    // Storage の実ファイル削除（あれば）
    if (doc.storagePath) {
      await supabaseAdmin.storage.from(BUCKET).remove([doc.storagePath]);
      // 失敗しても致命ではないため、ここでは結果を握りつぶします
    }

    return NextResponse.json({ ok: true });
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
