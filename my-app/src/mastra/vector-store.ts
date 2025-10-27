import { LibSQLVector } from "@mastra/libsql";

// LibSQLベクトルストアの設定
// NOTE: process.env.DATABASE_URL は Postgres 用の可能性があるため使用しない。
// libSQL 用の URL（例: "file:../mastra.db" または "libsql://..."）を優先する。
const libsqlUrl =
  process.env.LIBSQL_URL ||
  process.env.TURSO_DATABASE_URL ||
  "file:../mastra.db";

const libsqlAuthToken =
  process.env.LIBSQL_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

export const vectorStore = new LibSQLVector({
  connectionUrl: libsqlUrl,
  authToken: libsqlAuthToken,
});

// ベクトルデータベースのインデックス名
export const VECTOR_INDEX_NAME = "document_embeddings";

// エンベディングの次元数（text-embedding-3-smallの場合は1536）
export const EMBEDDING_DIMENSION = 1536;
