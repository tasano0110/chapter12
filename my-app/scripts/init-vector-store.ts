/**
 * ベクトルストアのインデックスを初期化するスクリプト
 */

import { initializeVectorStore } from '../src/mastra/services/document-processor';

async function main() {
  try {
    console.log('Initializing vector store...');
    await initializeVectorStore();
    console.log('✅ Vector store initialized successfully!');
  } catch (error) {
    console.error('❌ Failed to initialize vector store:', error);
    process.exit(1);
  }
}

main();
