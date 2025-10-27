import { MDocument } from "@mastra/rag";
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  vectorStore,
  VECTOR_INDEX_NAME,
  EMBEDDING_DIMENSION,
} from "../vector-store";

// トークン見積り（概算）: 文字数を 3 で割る近似。日本語・英数字混在で安全側。
function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 3);
}

// エンベディング API のコンテキスト上限を安全側に見積もった閾値
const MAX_TOKENS_PER_REQUEST = 7000; // 8,192 より十分小さく
const MAX_TOKENS_PER_CHUNK = 800; // 1 チャンクあたりの目安

/**
 * ドキュメントをチャンク化してベクトル化し、ベクトルストアに保存する
 */
export async function processDocument(params: {
  documentId: string;
  text: string;
  metadata: {
    title: string;
    category?: string;
    userId: string;
  };
}) {
  const { documentId, text, metadata } = params;

  // ベクトルストアのインデックスが未作成の場合に備えて、先に作成しておく
  // これにより、長時間のエンベディング生成後に「テーブルがない」エラーで失敗するのを防ぐ
  await initializeVectorStore();

  // 1. テキストからMDocumentを作成
  const doc = MDocument.fromText(text);

  // 2. ドキュメントをチャンクに分割（精度寄りの設定）
  const chunks = await doc.chunk({
    strategy: "recursive",
    maxSize: 800,
    overlap: 150,
    separators: [
      "\n\n",
      "\n",
      "。\n",
      "。",
      "？",
      "！",
      "・",
      "- ",
      "— ",
      "、",
      " ",
    ],
  });

  console.log(`Document ${documentId}: Created ${chunks.length} chunks`);

  // 3. チャンクの過大トークンを事前にクリップしつつ、動的にトークン上限内でバッチ化
  const usedTexts: string[] = chunks.map((c) => {
    const t = c.text;
    const est = estimateTokens(t);
    if (est <= MAX_TOKENS_PER_CHUNK) return t;
    const maxChars = MAX_TOKENS_PER_CHUNK * 3; // 概算で字数クリップ
    return t.slice(0, maxChars);
  });

  const allEmbeddings: number[][] = [];

  let batchStart = 0;
  while (batchStart < usedTexts.length) {
    let batchEnd = batchStart;
    let accTokens = 0;
    while (batchEnd < usedTexts.length) {
      const next = usedTexts[batchEnd];
      const nextTokens = estimateTokens(next);
      if (accTokens + nextTokens > MAX_TOKENS_PER_REQUEST) break;
      accTokens += nextTokens;
      batchEnd++;
      // 制御: 一度に極端に多く送らない（保険）
      if (batchEnd - batchStart >= 32) break;
    }

    const batch = usedTexts.slice(batchStart, batchEnd);
    const batchIndex =
      Math.floor(batchStart / Math.max(1, batchEnd - batchStart)) + 1;
    console.log(
      `Document ${documentId}: Processing dynamic batch ${batchIndex} (chunks ${
        batchStart + 1
      }-${batchEnd}/${usedTexts.length}, estTokens=${accTokens})`
    );

    try {
      const { embeddings } = await embedMany({
        model: openai.embedding("text-embedding-3-small"),
        values: batch,
      });
      allEmbeddings.push(...embeddings);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("maximum context length") ||
        errorMessage.includes("tokens")
      ) {
        console.error(
          `Document ${documentId}: Token limit exceeded even with dynamic batching. Falling back to smaller slices.`
        );
        // さらに強く分割（半分）
        if (batch.length > 1) {
          const mid = Math.floor(batch.length / 2);
          const left = usedTexts.slice(batchStart, batchStart + mid);
          const right = usedTexts.slice(batchStart + mid, batchEnd);
          // 左側再試行
          if (left.length > 0) {
            const { embeddings } = await embedMany({
              model: openai.embedding("text-embedding-3-small"),
              values: left,
            });
            allEmbeddings.push(...embeddings);
          }
          // 右側再試行
          if (right.length > 0) {
            const { embeddings } = await embedMany({
              model: openai.embedding("text-embedding-3-small"),
              values: right,
            });
            allEmbeddings.push(...embeddings);
          }
        } else {
          // 1件でも失敗した場合は、さらに強くトリムして再試行
          const single = batch[0];
          const trimmed = single.slice(0, Math.floor(single.length * 0.5));
          const { embeddings } = await embedMany({
            model: openai.embedding("text-embedding-3-small"),
            values: [trimmed],
          });
          allEmbeddings.push(...embeddings);
        }
      } else {
        console.error(
          `Document ${documentId}: Failed to generate embeddings:`,
          error
        );
        throw error;
      }
    }

    batchStart = Math.max(batchEnd, batchStart + 1);
  }

  console.log(
    `Document ${documentId}: Generated ${allEmbeddings.length} embeddings total`
  );

  // 4. ベクトルストアに保存（各チャンクにメタデータを付与）
  await vectorStore.upsert({
    indexName: VECTOR_INDEX_NAME,
    vectors: allEmbeddings,
    metadata: usedTexts.map((text, index) => ({
      text,
      documentId,
      chunkIndex: index,
      title: metadata.title,
      category: metadata.category,
      userId: metadata.userId,
    })),
  });

  console.log(`Document ${documentId}: Upserted to vector store`);

  return {
    success: true,
    chunksCount: chunks.length,
  };
}

/**
 * ベクトルストアのインデックスを作成（初回のみ実行）
 */
export async function initializeVectorStore() {
  try {
    await vectorStore.createIndex({
      indexName: VECTOR_INDEX_NAME,
      dimension: EMBEDDING_DIMENSION,
    });
    console.log(
      `Vector store index "${VECTOR_INDEX_NAME}" created successfully`
    );
  } catch (error) {
    // インデックスが既に存在する場合はエラーを無視
    if (error instanceof Error && error.message.includes("already exists")) {
      console.log(`Vector store index "${VECTOR_INDEX_NAME}" already exists`);
    } else {
      throw error;
    }
  }
}

/**
 * クエリテキストに類似したチャンクを検索
 */
export async function searchSimilarChunks(params: {
  query: string;
  userId: string;
  topK?: number;
  filter?: Record<string, unknown>;
}) {
  const { query, userId, topK = 10, filter = {} } = params;

  // 1. クエリテキストをエンベディングに変換
  const { embeddings } = await embedMany({
    model: openai.embedding("text-embedding-3-small"),
    values: [query],
  });

  const queryEmbedding = embeddings[0];

  // 2. ベクトルストアから類似チャンクを検索
  const results = await vectorStore.query({
    indexName: VECTOR_INDEX_NAME,
    queryVector: queryEmbedding,
    topK,
    filter: {
      userId, // ユーザーのドキュメントのみ検索
      ...filter,
    },
  });

  return results;
}

/**
 * ドキュメントに関連するベクトルをベクトルストアから削除
 */
export async function deleteDocumentVectors(documentId: string) {
  try {
    // 1. documentIdでフィルタリングして該当するベクトルを検索
    const results = await vectorStore.query({
      indexName: VECTOR_INDEX_NAME,
      queryVector: Array(EMBEDDING_DIMENSION).fill(0), // ダミーベクトル
      topK: 10000, // 大きな数値を指定して全件取得
      filter: {
        documentId,
      },
    });

    // 2. 各ベクトルをIDで削除
    let deletedCount = 0;
    for (const result of results) {
      await vectorStore.deleteVector({
        indexName: VECTOR_INDEX_NAME,
        id: result.id,
      });
      deletedCount++;
    }

    console.log(
      `Document ${documentId}: ${deletedCount} vectors deleted from vector store`
    );

    return {
      success: true,
      deletedCount,
    };
  } catch (error) {
    console.error(
      `Failed to delete vectors for document ${documentId}:`,
      error
    );
    throw error;
  }
}

/**
 * ドキュメントのメタデータをベクトルストア内で更新
 */
export async function updateDocumentMetadata(params: {
  documentId: string;
  metadata: {
    title?: string;
    category?: string;
  };
}) {
  const { documentId, metadata } = params;

  try {
    // 1. documentIdでフィルタリングして該当するベクトルを検索
    const results = await vectorStore.query({
      indexName: VECTOR_INDEX_NAME,
      queryVector: Array(EMBEDDING_DIMENSION).fill(0), // ダミーベクトル
      topK: 10000, // 大きな数値を指定して全件取得
      filter: {
        documentId,
      },
    });

    // 2. 各ベクトルのメタデータをIDで更新
    let updatedCount = 0;
    for (const result of results) {
      await vectorStore.updateVector({
        indexName: VECTOR_INDEX_NAME,
        id: result.id,
        update: {
          metadata: {
            ...result.metadata, // 既存のメタデータを保持
            ...metadata, // 新しいメタデータで上書き
          },
        },
      });
      updatedCount++;
    }

    console.log(
      `Document ${documentId}: ${updatedCount} vectors' metadata updated in vector store`
    );

    return {
      success: true,
      updatedCount,
    };
  } catch (error) {
    console.error(
      `Failed to update metadata for document ${documentId}:`,
      error
    );
    throw error;
  }
}
