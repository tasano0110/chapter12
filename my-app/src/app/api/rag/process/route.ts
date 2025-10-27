import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { processDocument } from "@/mastra/services/document-processor";
import {
  detectFileType,
  extractTextFromBuffer,
  cleanExtractedText,
} from "@/mastra/services/text-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = process.env.SUPABASE_BUCKET_DOCUMENTS || "document_files";

function getBearerToken(req: NextRequest): string | null {
  const auth =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function getUserIdFromToken(
  accessToken: string | null
): Promise<string | null> {
  if (!accessToken) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user.id;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    const userId = await getUserIdFromToken(token);
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const contentType = req.headers.get("content-type") || "";
    let id: string | undefined;
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      id = typeof body.id === "string" ? body.id : undefined;
    } else {
      const { searchParams } = new URL(req.url);
      id = searchParams.get("id") || undefined;
    }

    if (!id) {
      return NextResponse.json(
        { message: "Bad Request", detail: "id is required" },
        { status: 400 }
      );
    }

    const doc = await prisma.document.findFirst({
      where: { id, createdById: userId },
      include: { category: true },
    });

    if (!doc) {
      return NextResponse.json({ message: "Not Found" }, { status: 404 });
    }

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

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fileType = detectFileType({
      storagePath: doc.storagePath,
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

    const rawText = await extractTextFromBuffer({ buffer, type: fileType });
    const text = cleanExtractedText(rawText);

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
      { message: "Document processed successfully", data: result },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("RAG process error:", error);
    return NextResponse.json(
      {
        message: "Failed to process document",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: "Method Not Allowed", detail: "Use POST with JSON { id }" },
    { status: 405, headers: { Allow: "POST" } }
  );
}
