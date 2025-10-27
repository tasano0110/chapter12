"use client";

import { useEffect, useState, FormEvent, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase, uploadDocument } from "@/utils/supabase";

const DOCUMENT_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_BUCKET_DOCUMENTS ?? "document_files";
const MAX_FILE_SIZE_MB = 50;
const ACCEPT = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".md",
].join(",");

export default function NewDocumentPage() {
  const router = useRouter();

  // 認証チェック：未ログインなら /login へ
  useEffect(() => {
    let ignore = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (ignore) return;
      if (!data.session) {
        router.replace("/login");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [router]);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // メタデータはサーバー側で自動生成するため、入力欄は不要
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // ファイルバリデーション
  const handleFile = (f: File | null) => {
    setError(null);
    setInfo(null);
    if (!f) {
      setFile(null);
      return;
    }
    const sizeMB = f.size / (1024 * 1024);
    if (sizeMB > MAX_FILE_SIZE_MB) {
      setError(`ファイルサイズが大きすぎます（最大 ${MAX_FILE_SIZE_MB}MB）`);
      setFile(null);
      return;
    }
    setFile(f);
  };

  // D&D
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    handleFile(f ?? null);
  };
  const onDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
  };

  // アップロード処理
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!file) {
      setError("ファイルを選択してください。");
      return;
    }
    // タイトル/カテゴリ/サマリーの入力は不要（サーバー側で自動生成）

    setSending(true);
    try {
      // セッション取得（ユーザーIDと API 用トークン）
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || undefined;
      const userId = sessionData.session?.user?.id;
      if (!userId) {
        throw new Error(
          "ログイン情報を取得できませんでした。再ログインしてください。"
        );
      }

      // Supabase Storage へ先にアップロード（クライアント）
      const { data: uploadData, error: uploadErr } = await uploadDocument(
        file,
        {
          bucket: DOCUMENT_BUCKET,
          userId,
          upsert: false,
        }
      );
      if (uploadErr) {
        throw new Error(
          `Storage へのアップロードに失敗しました: ${uploadErr.message}`
        );
      }

      // storagePath のみを API に送る（メタデータはサーバーで自動生成）
      const fd = new FormData();
      const uploadedPath = uploadData?.path ?? undefined;
      if (uploadedPath) fd.append("storagePath", uploadedPath);

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`アップロード失敗 (${res.status}) ${text}`);
      }

      // レスポンスからドキュメントIDを取得
      const responseData = await res.json();
      const documentId = responseData.data?.id;

      if (documentId) {
        // RAG処理を実行（非同期で実行し、完了を待つ）
        setInfo("ドキュメントをRAG処理中...");
        try {
          const processRes = await fetch(
            `/api/documents/${documentId}/process`,
            {
              method: "POST",
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            }
          );

          if (!processRes.ok) {
            console.error(`RAG処理に失敗しました (${processRes.status})`);
            // RAG処理失敗はエラーとして扱わず、警告として表示
            setInfo(
              "アップロードは完了しましたが、RAG処理に失敗しました。後でドキュメント詳細ページから再処理してください。"
            );
            await new Promise((resolve) => setTimeout(resolve, 3000)); // 3秒待つ
          } else {
            setInfo("アップロードとRAG処理が完了しました。");
          }
        } catch (processErr) {
          console.error("RAG処理エラー:", processErr);
          setInfo("アップロードは完了しましたが、RAG処理に失敗しました。");
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } else {
        setInfo("アップロードが完了しました。");
      }

      router.replace("/documents");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {/* パンくず */}
      <nav aria-label="breadcrumb" className="text-sm text-[#6c757d]">
        <ol className="flex items-center gap-2">
          <li className="hover:text-[#003c68]">ホーム</li>
          <li>/</li>
          <li className="hover:text-[#003c68]">ドキュメント</li>
          <li>/</li>
          <li className="text-[#003c68]">アップロード</li>
        </ol>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-[#003c68]">アップロード</h1>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-md border border-[#dee2e6] bg-white p-6 shadow-sm md:p-8"
      >
        {error && (
          <div className="rounded-md border border-[#dc3545]/30 bg-[#dc3545]/10 px-4 py-3 text-sm text-[#dc3545]">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-md border border-[#0d6efd]/20 bg-[#e3f2fd] px-4 py-3 text-sm text-[#003c68]">
            {info}
          </div>
        )}

        {/* ファイル入力 */}
        <div>
          <label
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={[
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed px-6 py-8 text-center transition-colors",
              dragOver
                ? "border-[#003c68] bg-[#e3f2fd]"
                : "border-[#cbd5e1] bg-[#f8f9fa] hover:border-[#003c68] hover:bg-[#eef6ff]",
            ].join(" ")}
          >
            <input
              type="file"
              accept={ACCEPT}
              className="hidden"
              disabled={sending}
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <div className="text-sm text-[#333333]">
              {file ? (
                <>
                  <span className="font-medium text-[#003c68]">選択済み：</span>
                  <span className="ml-1">{file.name}</span>
                </>
              ) : (
                <>
                  ここにファイルをドラッグ&ドロップ、または
                  <span className="mx-1 underline">クリックして選択</span>
                </>
              )}
            </div>
            <div className="text-xs text-[#6c757d]">
              対応拡張子：{ACCEPT.replaceAll(",", "、")} ／ 最大{" "}
              {MAX_FILE_SIZE_MB}MB
            </div>
          </label>
        </div>

        {/* メタデータ入力は不要（サーバー側で自動生成） */}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={sending}
            className="inline-flex items-center justify-center rounded-md border border-[#dee2e6] px-4 py-2 text-sm text-[#6c757d] transition-colors hover:border-[#003c68] hover:text-[#003c68]"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex items-center justify-center rounded-md bg-[#003c68] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0056a3] disabled:cursor-not-allowed disabled:bg-[#6c757d]"
          >
            {sending ? "アップロード中..." : "アップロード"}
          </button>
        </div>
      </form>
    </div>
  );
}
