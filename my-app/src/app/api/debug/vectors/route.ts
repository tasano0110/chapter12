import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { vectorStore, VECTOR_INDEX_NAME, EMBEDDING_DIMENSION } from '@/mastra/vector-store';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Authorization ヘッダの "Bearer <token>" を取り出す */
function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/** アクセストークン → SupabaseユーザーID を取得 */
async function getUserIdFromToken(accessToken: string | null): Promise<string | null> {
  if (!accessToken) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * GET /api/debug/vectors
 * ベクトルストアの状態を確認（デバッグ用）
 */
export async function GET(req: NextRequest) {
  try {
    // 認証チェック
    const token = getBearerToken(req);
    const userId = await getUserIdFromToken(token);
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // ダミーベクトルで全件検索（userIdでフィルタリング）
    const allVectors = await vectorStore.query({
      indexName: VECTOR_INDEX_NAME,
      queryVector: Array(EMBEDDING_DIMENSION).fill(0),
      topK: 10000, // 大きな数値で全件取得を試みる
      filter: {
        userId,
      },
    });

    // ドキュメントIDごとにグループ化
    const documentGroups: Record<string, number> = {};
    for (const vector of allVectors) {
      const docId = vector.metadata?.documentId as string;
      if (docId) {
        documentGroups[docId] = (documentGroups[docId] || 0) + 1;
      }
    }

    return NextResponse.json({
      data: {
        totalVectors: allVectors.length,
        documentGroups,
        sampleVectors: allVectors.slice(0, 3).map(v => ({
          id: v.id,
          metadata: v.metadata,
          score: v.score,
        })),
      },
    });
  } catch (error: unknown) {
    console.error('Debug vectors error:', error);
    return NextResponse.json(
      {
        message: 'Failed to debug vectors',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
