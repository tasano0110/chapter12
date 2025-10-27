# RAGシステム実装ガイド

このドキュメントでは、MastraとAI SDKを使用したRAG（Retrieval-Augmented Generation）システムの実装について説明します。

## 概要

このシステムでは、ユーザーがアップロードしたドキュメントをベクトル化し、ベクトルデータベースに保存します。その後、ユーザーの質問に対して関連するドキュメントを検索し、AIが回答を生成します。

## 必要なパッケージ

以下のパッケージがインストールされています：

```json
{
  "@mastra/core": "^0.20.0",
  "@mastra/rag": "^1.3.0",
  "@mastra/libsql": "^0.15.1",
  "@ai-sdk/anthropic": "^1.2.12",
  "ai": "^5.0.60"
}
```

## 環境変数の設定

`.env.local`に以下の環境変数を追加してください：

```bash
# Anthropic API Key
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

Anthropic APIキーは、https://console.anthropic.com/ から取得できます。

## アーキテクチャ

### 1. ベクトルストアの設定 (`src/mastra/vector-store.ts`)

LibSQLをベクトルデータベースとして使用します。

```typescript
import { LibSQLVector } from '@mastra/libsql';

export const vectorStore = new LibSQLVector({
  connectionUrl: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const VECTOR_INDEX_NAME = 'document_embeddings';
export const EMBEDDING_DIMENSION = 1536;
```

### 2. ドキュメント処理サービス (`src/mastra/services/document-processor.ts`)

ドキュメントをチャンク化し、エンベディングを生成してベクトルストアに保存します。

主な機能：
- `processDocument()`: ドキュメントをチャンク化してベクトル化
- `initializeVectorStore()`: ベクトルストアのインデックスを作成
- `searchSimilarChunks()`: クエリに類似したチャンクを検索

### 3. RAGエージェント (`src/mastra/agents/rag-agent.ts`)

ドキュメント検索ツールを使用して、ユーザーの質問に回答するエージェントです。

### 4. Mastra設定 (`src/mastra/index.ts`)

RAGエージェントとベクトルストアをMastraに登録します。

```typescript
export const mastra = new Mastra({
  agents: {
    ragAgent,
  },
  vectors: {
    libsql: vectorStore,
  },
  // ...
});
```

## APIエンドポイント

### ドキュメント処理

**POST** `/api/documents/[id]/process`

ドキュメントをダウンロードし、RAG処理（チャンク化 + エンベディング + ベクトルストア保存）を実行します。

```typescript
// リクエスト例
fetch('/api/documents/123/process', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

レスポンス：
```json
{
  "message": "Document processed successfully",
  "data": {
    "success": true,
    "chunksCount": 10
  }
}
```

### チャット

**POST** `/api/chat`

RAGエージェントとチャットします。

```typescript
// リクエスト例
fetch('/api/chat', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: 'ドキュメントについて教えてください',
    conversationId: 'optional-conversation-id'
  })
})
```

レスポンス：
```json
{
  "data": {
    "conversationId": "uuid",
    "message": "AIの回答",
    "role": "assistant"
  }
}
```

**GET** `/api/chat?conversationId=xxx`

会話履歴を取得します。

## 使用方法

### 1. ベクトルストアの初期化（初回のみ）

アプリケーション起動時に一度だけ実行します：

```typescript
import { initializeVectorStore } from '@/mastra/services/document-processor';

await initializeVectorStore();
```

### 2. ドキュメントのアップロードと処理

1. ユーザーがドキュメントをアップロード
2. `/api/documents/[id]/process`を呼び出してRAG処理を実行
3. ドキュメントがチャンク化され、ベクトルストアに保存されます

### 3. AIとのチャット

1. ユーザーが質問を入力
2. `/api/chat`を呼び出してRAGエージェントに質問
3. RAGエージェントがベクトルストアから関連ドキュメントを検索
4. 検索結果を元にAIが回答を生成
5. 回答がユーザーに返されます

## データフロー

```
ユーザー → ドキュメントアップロード
    ↓
API: POST /api/documents
    ↓
Supabase Storage に保存
    ↓
API: POST /api/documents/[id]/process（自動実行）
    ↓
ドキュメント処理サービス
    ├─ テキスト抽出
    ├─ チャンク化（MDocument.chunk: maxSize=100, overlap=10）
    │   └─ 例: 10,000文字のドキュメント → 約110チャンク
    ├─ バッチ処理でエンベディング生成（embedMany）
    │   ├─ バッチ1:  チャンク1-10     → エンベディング生成
    │   ├─ バッチ2:  チャンク11-20    → エンベディング生成
    │   ├─ ...
    │   └─ バッチ11: チャンク101-110  → エンベディング生成
    └─ ベクトルストアに一括保存
    ↓
ユーザー → 質問を入力
    ↓
API: POST /api/chat
    ↓
RAGエージェント
    ├─ ベクトル検索（searchSimilarChunks）
    ├─ 関連チャンクを取得（デフォルト: 上位5件）
    └─ AIが回答生成
    ↓
ユーザー ← 回答を受信
```

## チャンク化の設定（最適化版）

`document-processor.ts`のチャンク化設定：

```typescript
const chunks = await doc.chunk({
  strategy: 'recursive',
  maxSize: 600,           // 意味的なまとまりを保持する適切なサイズ
  overlap: 80,            // 文脈を保持するオーバーラップ（約13%）
  separators: ['\n\n', '\n', '。', '、', ' '], // 区切り文字
});
```

**設定理由**:
- **600文字**: 意味的なまとまりを保ちつつ、トークン制限内に収まる最適なサイズ
  - 日本語: 600文字 ≈ 300トークン
  - 英語/コード: 600文字 ≈ 600-1200トークン
- **80文字のオーバーラップ**: チャンク間で文脈が途切れるのを防ぐ
- **検索精度の向上**: より大きなチャンクで意味的な完全性を保持

## バッチ処理（シンプル化）

OpenAI text-embedding-3-small APIの制限（**1リクエストあたり最大8,191トークン**）に対して十分な余裕を持たせた、シンプルで予測可能なバッチ処理を採用。

- **バッチサイズ**: 50チャンク/バッチ（固定）
- **推定トークン数**: 最悪ケースで約3,000-6,000トークン/バッチ
  - 日本語主体: 約1,500-2,500トークン/バッチ
  - 英語/コード主体: 約3,000-6,000トークン/バッチ
- **安全マージン**: 8,191トークンの約27-50%余裕を確保
- **処理方法**: シンプルなforループで順次処理、エラー時は詳細なログを出力

## エンベディングモデル

OpenAIの`text-embedding-3-small`エンベディングモデルを使用しています：

```typescript
const { embeddings } = await embedMany({
  model: openai.embedding('text-embedding-3-small'),
  values: batchChunks.map((chunk) => chunk.text),
});
```

- **モデル**: `text-embedding-3-small`
- **次元数**: 1536次元
- **コスト効率**: 高速かつ低コスト

## トラブルシューティング

### ベクトルストアのインデックスが作成されない

`initializeVectorStore()`を実行してインデックスを作成してください。

```bash
npx tsx scripts/init-vector-store.ts
```

### エンベディング生成に失敗する

- `OPENAI_API_KEY`が正しく設定されているか確認してください
- OpenAI APIの利用制限を超えていないか確認してください

### 大きなドキュメントで「max tokens」エラーが出る

**症状**:
- `This model's maximum context length is 8192 tokens, however you requested 10017 tokens`

**原因**: ドキュメントが大きすぎて、一度にエンベディングAPIに送信できるトークン数の上限を超えている

**OpenAI text-embedding-3-small APIの制限**:
- **最大トークン数**: 8,191トークン/リクエスト

**対策**:
現在の最適化された設定（**バッチサイズ50、チャンクサイズ600**）で、ほとんどのケースに対応できます。

**トークン密度の目安**:
- 日本語: 1文字 ≈ 0.5トークン
- 英語: 1文字 ≈ 1-2トークン
- プログラムコード: 1文字 ≈ 2-4トークン

**現在の設定での安全性**:
- 最悪ケース: 50チャンク × 600文字 × 2トークン/文字 = 60,000文字 → 約6,000トークン
- 8,191トークンの上限に対して約27%の余裕

**それでもエラーが出る場合**（極めて稀なケース）:
エラーメッセージに詳細なログが出力されるので、以下を調整してください:
1. `document-processor.ts`の`maxSize`を400に縮小
2. または`BATCH_SIZE`を30に縮小

### 検索結果が返ってこない

- ドキュメントが正常に処理されたか確認してください
- ベクトルストアにデータが保存されているか確認してください
- ユーザーIDでフィルタリングされているため、正しいユーザーでログインしているか確認してください

## 最適化された設計のポイント

### 1. チャンクサイズの最適化
- **600文字**: 意味的なまとまりを保持し、検索精度を大幅に向上
- 従来の200文字から3倍に拡大することで、文脈が途切れにくくなりました

### 2. バッチ処理のシンプル化
- **固定50チャンク/バッチ**: 予測可能な処理時間
- 複雑な適応的ロジックを削除し、メンテナンス性を向上

### 3. 検索品質の向上
- **topK=10**: より多くの関連チャンクを取得
- RAGエージェントに明確な検索戦略を指示

### 4. エラーハンドリング
- 詳細なログ出力でデバッグを容易に
- エラー時に具体的な調整方法を提示

## パフォーマンス指標

### 処理時間の目安
- **小規模ドキュメント** (1,000文字): 約1-2秒
- **中規模ドキュメント** (10,000文字): 約3-5秒
- **大規模ドキュメント** (100,000文字): 約20-30秒

### 検索精度
- **チャンクサイズ600文字 + オーバーラップ80文字**:
  - 意味的なまとまりを保持
  - 文脈が途切れにくい
  - 検索時に関連情報を見逃しにくい

## 今後の拡張案

1. **ストリーミングレスポンス**: AIの回答をストリーミングで返す
2. **リランキング**: 検索結果をリランキングしてさらに精度を向上
3. **ファイルタイプのサポート拡張**: PDF、Word、PowerPointなど
4. **マルチモーダル対応**: 画像や表を含むドキュメントの処理
5. **会話履歴の活用**: 過去の会話を考慮した回答生成
6. **ハイブリッド検索**: ベクトル検索とキーワード検索の組み合わせ

## 参考リンク

- [Mastra Documentation](https://mastra.ai/docs)
- [Mastra RAG Guide](https://mastra.ai/docs/rag)
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [AI SDK Documentation](https://sdk.vercel.ai/)
