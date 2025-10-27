import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mastra } from "@/mastra";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
 * POST /api/chat
 * RAGエージェントとチャット
 */
export async function POST(req: NextRequest) {
  try {
    // 認証チェック
    const token = getBearerToken(req);
    const userId = await getUserIdFromToken(token);
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { message, conversationId } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { message: "Message is required" },
        { status: 400 }
      );
    }

    // 会話IDが指定されている場合は取得、なければ新規作成
    let conversation;
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });

      if (!conversation || conversation.userId !== userId) {
        return NextResponse.json(
          { message: "Conversation not found or forbidden" },
          { status: 404 }
        );
      }
    } else {
      // 新規会話を作成
      conversation = await prisma.conversation.create({
        data: {
          userId,
          title: message.slice(0, 50), // 最初のメッセージの一部をタイトルに
        },
      });
    }

    // ユーザーメッセージを保存
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId,
        role: "user",
        content: message,
      },
    });

    // RAGエージェントでストリーミング応答
    const agent = mastra.getAgent("ragAgent");
    const streamResponse = await agent.stream(
      [{ role: "user", content: message }],
      {
        resourceId: userId,
      }
    );

    const encoder = new TextEncoder();
    let fullText = "";

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of streamResponse.textStream) {
            const text = String(chunk);
            fullText += text;
            controller.enqueue(encoder.encode(text));
          }
        } catch (e) {
          controller.error(e);
          return;
        }

        // ストリーム完了後にメッセージ保存
        try {
          await prisma.message.create({
            data: {
              conversationId: conversation.id,
              role: "assistant",
              content: fullText,
            },
          });
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date() },
          });
        } catch (e) {
          // 保存失敗はログのみ
          console.error("Stream save error:", e);
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Conversation-Id": conversation.id,
      },
    });
  } catch (error: unknown) {
    console.error("Chat error:", error);
    return NextResponse.json(
      {
        message: "Failed to process chat",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/chat?conversationId=xxx
 * 会話履歴を取得
 */
export async function GET(req: NextRequest) {
  try {
    // 認証チェック
    const token = getBearerToken(req);
    const userId = await getUserIdFromToken(token);
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    if (!conversationId) {
      // 全会話一覧を取得
      const conversations = await prisma.conversation.findMany({
        where: { userId },
        orderBy: { lastMessageAt: "desc" },
        take: 50,
      });

      return NextResponse.json({ data: conversations });
    }

    // 特定の会話のメッセージ一覧を取得
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation || conversation.userId !== userId) {
      return NextResponse.json(
        { message: "Conversation not found or forbidden" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: conversation });
  } catch (error: unknown) {
    console.error("Get chat error:", error);
    return NextResponse.json(
      {
        message: "Failed to get chat",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
