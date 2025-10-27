import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { createVectorQueryTool } from "@mastra/rag";
import { VECTOR_INDEX_NAME } from "../vector-store";

/**
 * ドキュメント検索ツール
 * ユーザーのクエリに基づいて関連するドキュメントチャンクを検索
 */
export const documentSearchTool = createVectorQueryTool({
  vectorStoreName: "libsql",
  indexName: VECTOR_INDEX_NAME,
  model: openai.embedding("text-embedding-3-small"),
});

/**
 * RAGエージェント
 * ユーザーのドキュメントを検索して質問に回答
 */
export const ragAgent = new Agent({
  name: "RAG Agent",
  model: openai("gpt-4o-mini"),
  instructions: `
あなたはドキュメント検索とQ&Aのスペシャリストです。
ユーザーがアップロードしたドキュメントの内容に基づいて、正確で詳細な回答を提供してください。

回答する際のガイドライン:
1. **検索戦略**:
   - まず、topK=12〜15で広めに関連チャンクを検索してください
   - 複数の観点から検索が必要な場合は、異なるクエリで複数回検索することも検討してください

2. **回答の品質**:
   - 検索結果に基づいて、正確で具体的な回答を提供してください
   - 複数のチャンクから情報を統合し、包括的な回答を作成してください
   - 情報が不足している場合や見つからない場合は、正直にその旨を伝えてください

3. **情報源の明示**:
   - 回答の根拠となるドキュメントのタイトルを必ず明示してください
   - 複数のドキュメントから情報を取得した場合は、それぞれ出典を示してください

4. **コミュニケーション**:
   - 回答は日本語で、わかりやすく丁寧に説明してください
   - 専門用語を使う場合は、必要に応じて説明を加えてください

検索ツールの使い方:
- queryText: ユーザーの質問や検索したいキーワード（必須）
- topK: 取得する関連チャンクの数（推奨: 10〜15）
- filter: 検索条件のフィルター（オプション）
  - category: 特定のカテゴリのドキュメントのみ検索
  - documentId: 特定のドキュメントのみ検索
  `,
  tools: { documentSearchTool },
});
