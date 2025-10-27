"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/utils/supabase";

type DocumentDetail = {
  id: string;
  title: string;
  summary?: string | null;
  category?: string | null;
  uploadedAt?: string | null; // ISO string
  fileUrl?: string | null;
  storagePath?: string | null;
};

type ApiDetailResponse = {
  data: DocumentDetail | null;
};

export default function DocumentDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formSummary, setFormSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // チャット機能はグローバルパネルへ移動済み（本ページからは除外）
  const [processing, setProcessing] = useState(false);
  const [generating, setGenerating] = useState(false);

  // 1) 認証チェック
  useEffect(() => {
    let ignore = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (ignore) return;
      if (!data.session) {
        setAuthed(false);
        router.replace("/login");
        return;
      }
      setAuthed(true);
    })();
    return () => {
      ignore = true;
    };
  }, [router]);

  // 2) 詳細取得
  useEffect(() => {
    if (authed !== true || !id) return;
    let ignore = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        setInfo(null);

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        const res = await fetch(`/api/documents/${id}`, {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`詳細の取得に失敗しました (${res.status}) ${text}`);
        }
        const json: ApiDetailResponse = await res.json();
        if (ignore) return;

        setDoc(json.data ?? null);
      } catch (e: unknown) {
        if (!ignore)
          setError(e instanceof Error ? e.message : "エラーが発生しました");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [authed, id]);

  const uploadedAtText = useMemo(() => {
    if (!doc?.uploadedAt) return "-";
    try {
      return new Date(doc.uploadedAt).toLocaleString("ja-JP");
    } catch {
      return doc.uploadedAt;
    }
  }, [doc?.uploadedAt]);

  useEffect(() => {
    if (!doc) {
      setFormTitle("");
      setFormCategory("");
      setFormSummary("");
      return;
    }
    setFormTitle(doc.title);
    setFormCategory(doc.category ?? "");
    setFormSummary(doc.summary ?? "");
  }, [doc]);

  useEffect(() => {
    if (!doc) {
      setPreviewUrl(null);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    if (doc.fileUrl) {
      setPreviewUrl(doc.fileUrl);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    if (!doc.storagePath) {
      setPreviewUrl(null);
      setPreviewLoading(false);
      setPreviewError("プレビュー用のファイルパスが見つかりませんでした。");
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);

    const bucket =
      process.env.NEXT_PUBLIC_SUPABASE_BUCKET_DOCUMENTS ?? "document_files";

    try {
      const { data } = supabase.storage
        .from(bucket)
        .getPublicUrl(doc.storagePath);
      const url = data.publicUrl ?? null;
      setPreviewUrl(url);
      if (!url) {
        setPreviewError("プレビュー用のURLを取得できませんでした。");
      }
    } catch (err: unknown) {
      setPreviewUrl(null);
      setPreviewError(
        err instanceof Error
          ? err.message
          : "プレビューURLの取得に失敗しました。"
      );
    } finally {
      setPreviewLoading(false);
    }
  }, [doc]);

  const effectiveFileUrl = previewUrl ?? doc?.fileUrl ?? null;

  const onCancelEdit = () => {
    if (doc) {
      setFormTitle(doc.title);
      setFormCategory(doc.category ?? "");
      setFormSummary(doc.summary ?? "");
    } else {
      setFormTitle("");
      setFormCategory("");
      setFormSummary("");
    }
    setEditMode(false);
    setError(null);
    setInfo(null);
  };

  // RAG処理ボタン
  const onProcessRAG = async () => {
    if (!id) return;
    setProcessing(true);
    setError(null);
    setInfo(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`/api/documents/${id}/process`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`RAG処理に失敗しました (${res.status}) ${text}`);
      }
      setInfo("RAG処理が完了しました。");
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "RAG処理中にエラーが発生しました"
      );
    } finally {
      setProcessing(false);
    }
  };

  // AI自動入力ボタン
  const onGenerateMetadata = async () => {
    console.log("AI自動入力ボタンがクリックされました");
    if (!id) {
      console.error("ドキュメントIDがありません");
      return;
    }
    setGenerating(true);
    setError(null);
    setInfo(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      console.log("APIリクエストを送信中...", `/api/documents/${id}/generate-metadata`);

      const res = await fetch(`/api/documents/${id}/generate-metadata`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      console.log("APIレスポンスステータス:", res.status);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("APIエラーレスポンス:", text);
        throw new Error(
          `メタデータの自動生成に失敗しました (${res.status}) ${text}`
        );
      }
      const json = await res.json();
      console.log("APIレスポンスデータ:", json);

      const { title, category, summary } = json.data;

      // フォームに自動入力
      setFormTitle(title || "");
      setFormCategory(category || "");
      setFormSummary(summary || "");

      setInfo("AIによるメタデータの自動生成が完了しました。");
    } catch (e: unknown) {
      console.error("エラーが発生しました:", e);
      setError(
        e instanceof Error
          ? e.message
          : "メタデータの自動生成中にエラーが発生しました"
      );
    } finally {
      setGenerating(false);
    }
  };

  const onUpdate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!id) return;

    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) {
      setError("タイトルは必須です。");
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: trimmedTitle,
          category: formCategory.trim(),
          summary: formSummary.trim(),
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`更新に失敗しました (${res.status}) ${text}`);
      }

      const json: ApiDetailResponse = await res.json();
      if (json.data) {
        setDoc(json.data);
      }
      setEditMode(false);
      setInfo("更新が完了しました。");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "更新中にエラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  // 3) 削除
  const onDelete = async () => {
    if (!id) return;
    const ok = window.confirm("このドキュメントを削除します。よろしいですか？");
    if (!ok) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`削除に失敗しました (${res.status}) ${text}`);
      }

      // 削除成功 → 一覧へ戻る
      router.replace("/documents");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "削除中にエラーが発生しました");
    }
  };

  if (authed === null) {
    return (
      <div className="p-4">
        <div className="animate-pulse text-[#6c757d]">読み込み中...</div>
      </div>
    );
  }
  if (authed === false) {
    return null; // /login へ遷移
  }

  return (
    <div className="mx-auto h-full w-full max-w-[1200px] px-4 sm:px-6">
      {/* 左側：ドキュメント詳細 */}
      <div className="pt-2">
        {/* パンくず */}
        <nav aria-label="breadcrumb" className="mb-2 text-sm text-[#6c757d]">
          <ol className="flex items-center gap-2">
            <li className="hover:text-[#003c68]">ホーム</li>
            <li>/</li>
            <li>
              <Link href="/documents" className="hover:text-[#003c68]">
                ドキュメント
              </Link>
            </li>
            <li>/</li>
            <li className="text-[#003c68]">詳細</li>
          </ol>
        </nav>
        {/* ヘッダ行 */}
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-semibold text-[#003c68]">
            ドキュメント詳細
          </h1>
          <div className="flex items-center gap-2">
            <Link
              href="/documents"
              className="rounded-md border border-[#dee2e6] px-3 py-2 text-sm text-[#6c757d] transition-colors hover:border-[#003c68] hover:text-[#003c68]"
            >
              一覧へ戻る
            </Link>
            {!editMode && doc && (
              <button
                type="button"
                onClick={() => {
                  setEditMode(true);
                  setError(null);
                  setInfo(null);
                }}
                disabled={saving}
                className="rounded-md border border-[#003c68] px-3 py-2 text-sm text-[#003c68] transition-colors hover:bg-[#e3f2fd]"
              >
                編集
              </button>
            )}
            {doc && (
              <button
                type="button"
                onClick={onProcessRAG}
                disabled={processing}
                className="rounded-md border border-[#28a745] px-3 py-2 text-sm text-[#28a745] transition-colors hover:bg-[#d4edda] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processing ? "RAG処理中..." : "RAG処理"}
              </button>
            )}
            <button
              onClick={onDelete}
              className="rounded-md border px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              削除
            </button>
          </div>
        </div>

        {/* ステータス */}
        {error && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 rounded-md bg-[#e3f2fd] px-3 py-2 text-sm text-[#003c68]">
            {info}
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-[#dee2e6] bg-white p-6">
            <div className="h-6 w-2/3 animate-pulse rounded bg-gray-100" />
            <div className="mt-3 h-4 w-32 animate-pulse rounded bg-gray-100" />
            <div className="mt-6 h-24 w-full animate-pulse rounded bg-gray-100" />
          </div>
        )}

        {!loading && doc && (
          <div className="rounded-md border border-[#dee2e6] bg-white p-6">
            {editMode ? (
              <form onSubmit={onUpdate} className="space-y-6">
                {/* AI自動入力ボタン */}
                <div className="flex items-center justify-between border-b border-[#dee2e6] pb-4">
                  <div>
                    <h3 className="text-sm font-medium text-[#003c68]">
                      メタデータの編集
                    </h3>
                    <p className="mt-1 text-xs text-[#6c757d]">
                      AIを使ってタイトル、カテゴリ、サマリーを自動生成できます
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onGenerateMetadata}
                    disabled={generating || saving}
                    className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-[#003c68] to-[#0056a3] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {generating ? (
                      <>
                        <svg
                          className="h-4 w-4 animate-spin"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        AI生成中...
                      </>
                    ) : (
                      <>
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        AI自動入力
                      </>
                    )}
                  </button>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#003c68]">
                    タイトル
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    disabled={saving || generating}
                    className="w-full rounded-md border border-[#cbd5e1] px-3 py-2 text-sm focus:border-[#003c68] focus:outline-none"
                    placeholder="ドキュメントのタイトル"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#003c68]">
                    カテゴリ
                  </label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    disabled={saving || generating}
                    className="w-full rounded-md border border-[#cbd5e1] px-3 py-2 text-sm focus:border-[#003c68] focus:outline-none"
                    placeholder="例：営業資料"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#003c68]">
                    サマリー
                  </label>
                  <textarea
                    value={formSummary}
                    onChange={(e) => setFormSummary(e.target.value)}
                    disabled={saving || generating}
                    className="min-h-[120px] w-full rounded-md border border-[#cbd5e1] px-3 py-2 text-sm focus:border-[#003c68] focus:outline-none"
                    placeholder="内容の概要を入力してください"
                  />
                </div>
                <div className="text-xs text-[#6c757d]">
                  アップロード：{uploadedAtText}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving || generating}
                    className="inline-flex items-center gap-2 rounded-md bg-[#003c68] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0056a3] disabled:cursor-not-allowed disabled:bg-[#6c757d]"
                  >
                    {saving ? "保存中..." : "保存"}
                  </button>
                  <button
                    type="button"
                    disabled={saving || generating}
                    onClick={onCancelEdit}
                    className="rounded-md border border-[#dee2e6] px-4 py-2 text-sm font-medium text-[#333333] transition-colors hover:border-[#003c68] hover:text-[#003c68] disabled:cursor-not-allowed"
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="mb-1 text-xs text-[#6c757d]">
                  {doc.category ?? "未分類"}
                </div>
                <h2 className="text-xl font-semibold text-[#003c68]">
                  {doc.title}
                </h2>
                <div className="mt-1 text-xs text-[#6c757d]">
                  アップロード：{uploadedAtText}
                </div>

                <div className="mt-4">
                  <div className="mb-1 text-sm font-medium text-[#6c757d]">
                    サマリー
                  </div>
                  {doc.summary ? (
                    <p className="whitespace-pre-wrap break-words text-sm text-[#333333]">
                      {doc.summary}
                    </p>
                  ) : (
                    <p className="text-sm text-[#6c757d]">
                      サマリーは登録されていません
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="mt-6 flex items-center gap-3">
              {effectiveFileUrl ? (
                <>
                  <a
                    href={effectiveFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-[#003c68] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0056a3]"
                  >
                    ファイルを開く
                  </a>
                  <a
                    href={effectiveFileUrl}
                    download
                    className="rounded-full border border-[#dee2e6] px-4 py-2 text-sm font-medium text-[#333333] transition-colors hover:border-[#003c68] hover:text-[#003c68]"
                  >
                    ダウンロード
                  </a>
                </>
              ) : (
                <span className="text-sm text-[#6c757d]">
                  ファイルURLが登録されていません
                </span>
              )}
            </div>

            <div className="mt-8">
              <div className="mb-2 text-sm font-medium text-[#6c757d]">
                PDFプレビュー
              </div>
              {!previewLoading && !previewError && previewUrl && (
                <div className="overflow-hidden rounded-md border border-[#dee2e6]">
                  <iframe
                    src={`${previewUrl}#toolbar=0&navpanes=0`}
                    title="document preview"
                    className="h-[600px] w-full"
                    loading="lazy"
                  />
                </div>
              )}
              {previewLoading && (
                <div className="rounded-md border border-dashed border-[#cbd5e1] bg-[#f8f9fa] p-6 text-sm text-[#6c757d]">
                  プレビューを準備しています...
                </div>
              )}
              {previewError && !previewLoading && (
                <div className="rounded-md border border-[#dc3545]/30 bg-[#dc3545]/10 p-4 text-sm text-[#dc3545]">
                  {previewError}
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && !doc && !error && (
          <div className="rounded-xl border border-[#dee2e6] bg-white p-6 text-center text-sm text-[#6c757d]">
            ドキュメントが見つかりませんでした。
          </div>
        )}
      </div>
    </div>
  );
}
