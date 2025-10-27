/**
 * ベクトルストアの状態を確認するスクリプト
 *
 * 使い方:
 * 1. ブラウザでログイン
 * 2. ブラウザの開発者ツールのコンソールで以下を実行:
 *
 * fetch('/api/debug/vectors', {
 *   headers: {
 *     'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
 *   }
 * }).then(r => r.json()).then(console.log)
 */

import { vectorStore, VECTOR_INDEX_NAME, EMBEDDING_DIMENSION } from '../src/mastra/vector-store';

async function checkVectors() {
  try {
    console.log('Checking vector store...');
    console.log('Index name:', VECTOR_INDEX_NAME);
    console.log('Embedding dimension:', EMBEDDING_DIMENSION);

    // ダミーベクトルで全件検索を試みる
    const results = await vectorStore.query({
      indexName: VECTOR_INDEX_NAME,
      queryVector: Array(EMBEDDING_DIMENSION).fill(0),
      topK: 10000,
      filter: {}, // フィルタなしで全ユーザーのベクトルを取得
    });

    console.log('\n=== Vector Store Status ===');
    console.log('Total vectors:', results.length);

    // ドキュメントIDごとにグループ化
    const documentGroups: Record<string, number> = {};
    const userGroups: Record<string, number> = {};

    for (const vector of results) {
      const docId = vector.metadata?.documentId as string;
      const userId = vector.metadata?.userId as string;

      if (docId) {
        documentGroups[docId] = (documentGroups[docId] || 0) + 1;
      }
      if (userId) {
        userGroups[userId] = (userGroups[userId] || 0) + 1;
      }
    }

    console.log('\n=== Documents ===');
    console.log('Unique documents:', Object.keys(documentGroups).length);
    for (const [docId, count] of Object.entries(documentGroups)) {
      console.log(`  ${docId}: ${count} vectors`);
    }

    console.log('\n=== Users ===');
    console.log('Unique users:', Object.keys(userGroups).length);
    for (const [userId, count] of Object.entries(userGroups)) {
      console.log(`  ${userId}: ${count} vectors`);
    }

    if (results.length > 0) {
      console.log('\n=== Sample Vector ===');
      console.log('ID:', results[0].id);
      console.log('Metadata:', results[0].metadata);
      console.log('Score:', results[0].score);
    }
  } catch (error) {
    console.error('Error checking vectors:', error);
  }
}

checkVectors();
