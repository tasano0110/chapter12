import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import {
  deleteDocumentVectors,
  updateDocumentMetadata,
} from "@/mastra/services/document-processor";
import { ensureBucketExistsAdmin } from "@/utils/ensureBucket";

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

/** 共通：未認証なら 401（Supabase検証失敗時はJWTフェイルセーフ） */
async function requireUserId(req: NextRequest): Promise<string | NextResponse> {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json(
      { message: "Unauthorized", detail: "Missing bearer token" },
      { status: 401 }
    );
  }
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error) {
      // 検証APIが失敗するケースに備えてフェイルセーフ
      try {
        const payloadPart = token.split(".")[1];
        const json = JSON.parse(
          Buffer.from(payloadPart, "base64").toString("utf8")
        );
        const sub = typeof json?.sub === "string" ? json.sub : null;
        const exp = typeof json?.exp === "number" ? json.exp : 0;
        const now = Math.floor(Date.now() / 1000);
        if (sub && exp > now) {
          return sub;
        }
      } catch {}
      return NextResponse.json(
        { message: "Unauthorized", detail: error.message },
        { status: 401 }
      );
    }
    if (!data?.user?.id) {
      try {
        const payloadPart = token.split(".")[1];
        const json = JSON.parse(
          Buffer.from(payloadPart, "base64").toString("utf8")
        );
        const sub = typeof json?.sub === "string" ? json.sub : null;
        const exp = typeof json?.exp === "number" ? json.exp : 0;
        const now = Math.floor(Date.now() / 1000);
        if (sub && exp > now) {
          return sub;
        }
      } catch {}
      return NextResponse.json(
        { message: "Unauthorized", detail: "No user for access token" },
        { status: 401 }
      );
    }
    return data.user.id;
  } catch (e: unknown) {
    return NextResponse.json(
      {
        message: "Unauthorized",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 401 }
    );
  }
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
    // バケットが無い場合（Restore直後など）に備えて作成しておく
    await ensureBucketExistsAdmin(supabaseAdmin, BUCKET);

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
    const vectorMetadataUpdates: { title?: string; category?: string } = {};

    if (typeof payload.title === "string") {
      const t = payload.title.trim();
      if (t.length === 0) {
        return NextResponse.json(
          { message: "title を空にはできません" },
          { status: 400 }
        );
      }
      updateData.title = t;
      vectorMetadataUpdates.title = t;
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
      vectorMetadataUpdates.category = resolvedCategoryName;
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

    // ベクトルストアのメタデータも更新（title or category が変更された場合）
    if (Object.keys(vectorMetadataUpdates).length > 0) {
      try {
        await updateDocumentMetadata({
          documentId: id,
          metadata: vectorMetadataUpdates,
        });
        console.log(`Vector metadata for document ${id} updated successfully`);
      } catch (vectorError) {
        console.error(
          `Failed to update vector metadata for document ${id}:`,
          vectorError
        );
        // メタデータ更新失敗は警告として扱い、処理を継続
      }
    }

    // 最新を返す
    const latest = await prisma.document.findFirst({
      where: { id, createdById: userId },
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

    // 1. ベクトルストアからドキュメントのベクトルを削除
    try {
      await deleteDocumentVectors(id);
      console.log(`Vectors for document ${id} deleted successfully`);
    } catch (vectorError) {
      console.error(
        `Failed to delete vectors for document ${id}:`,
        vectorError
      );
      // ベクトル削除失敗は警告として扱い、処理を継続
    }

    // 2. DB を消す
    await prisma.document.delete({
      where: { id },
    });

    // 3. Storage の実ファイル削除（あれば）
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
