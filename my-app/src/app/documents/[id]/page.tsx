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
    <div className="mx-auto max-w-3xl">
      {/* ヘッダ行 */}
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold text-[#003c68]">
          ドキュメント詳細
        </h1>
        <div className="flex items-center gap-2">
          <Link
            href="/documents"
            className="rounded-full border border-[#dee2e6] px-3 py-2 text-sm text-[#6c757d] transition-colors hover:border-[#003c68] hover:text-[#003c68]"
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
              className="rounded-lg border border-[#003c68] px-3 py-2 text-sm text-[#003c68] transition-colors hover:bg-[#e3f2fd]"
            >
              編集
            </button>
          )}
          <button
            onClick={onDelete}
            className="rounded-lg border px-3 py-2 text-sm text-red-600 hover:bg-red-50"
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

      {/* 本体 */}
      {!loading && doc && (
        <div className="rounded-xl border border-[#dee2e6] bg-white p-6">
          {editMode ? (
            <form onSubmit={onUpdate} className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#003c68]">
                  タイトル
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-lg border border-[#cbd5e1] px-3 py-2 text-sm focus:border-[#003c68] focus:outline-none"
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
                  className="w-full rounded-lg border border-[#cbd5e1] px-3 py-2 text-sm focus:border-[#003c68] focus:outline-none"
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
                  className="min-h-[120px] w-full rounded-lg border border-[#cbd5e1] px-3 py-2 text-sm focus:border-[#003c68] focus:outline-none"
                  placeholder="内容の概要を入力してください"
                />
              </div>
              <div className="text-xs text-[#6c757d]">
                アップロード：{uploadedAtText}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full bg-[#003c68] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0056a3] disabled:cursor-not-allowed disabled:bg-[#6c757d]"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={onCancelEdit}
                  className="rounded-full border border-[#dee2e6] px-4 py-2 text-sm font-medium text-[#333333] transition-colors hover:border-[#003c68] hover:text-[#003c68] disabled:cursor-not-allowed"
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
                  <p className="whitespace-pre-wrap text-sm text-[#333333]">
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
            {previewLoading && (
              <div className="rounded-lg border border-dashed border-[#cbd5e1] bg-[#f8f9fa] p-6 text-sm text-[#6c757d]">
                プレビューを準備しています...
              </div>
            )}
            {previewError && !previewLoading && (
              <div className="rounded-lg border border-[#dc3545]/30 bg-[#dc3545]/10 p-4 text-sm text-[#dc3545]">
                {previewError}
              </div>
            )}
            {!previewLoading && !previewError && previewUrl && (
              <div className="overflow-hidden rounded-xl border border-[#dee2e6]">
                <iframe
                  src={`${previewUrl}#toolbar=0&navpanes=0`}
                  title="document preview"
                  className="h-[600px] w-full"
                  loading="lazy"
                />
              </div>
            )}
            {!previewLoading && !previewError && !previewUrl && (
              <div className="rounded-lg border border-dashed border-[#cbd5e1] bg-[#f8f9fa] p-6 text-sm text-[#6c757d]">
                プレビューを表示できるPDFがありません。
              </div>
            )}
          </div>
        </div>
      )}

      {/* データなし */}
      {!loading && !doc && !error && (
        <div className="rounded-xl border border-[#dee2e6] bg-white p-6 text-center text-sm text-[#6c757d]">
          ドキュメントが見つかりませんでした。
        </div>
      )}
    </div>
  );
}
