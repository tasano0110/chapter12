"use client";

import { useEffect, useState, FormEvent, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabase";
import { v4 as uuidv4 } from "uuid";

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
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [summary, setSummary] = useState("");
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
    if (!title.trim()) {
      setError("タイトルは必須です。");
      return;
    }

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
      const ext = file.name.includes(".")
        ? file.name.split(".").pop()
        : undefined;
      const fileName = `${Date.now()}_${uuidv4()}${ext ? "." + ext : ""}`;
      const objectPath = `${userId}/${fileName}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .upload(objectPath, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
      if (uploadErr) {
        throw new Error(
          `Storage へのアップロードに失敗しました: ${uploadErr.message}`
        );
      }

      // メタデータ + storagePath を API に送る
      const fd = new FormData();
      fd.append("title", title.trim());
      if (category.trim()) fd.append("category", category.trim());
      if (summary.trim()) fd.append("summary", summary.trim());
      const uploadedPath = uploadData?.path ?? objectPath;
      fd.append("storagePath", uploadedPath);

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`アップロード失敗 (${res.status}) ${text}`);
      }

      setInfo("アップロードが完了しました。");
      router.replace("/documents");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#003c68]">
          ドキュメントをアップロード
        </h1>
        <p className="mt-2 text-sm text-[#6c757d]">
          社内で共有したい資料を登録し、ナレッジを最新の状態に保ちましょう。
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-2xl border border-[#dee2e6] bg-white p-6 shadow-sm md:p-8"
      >
        {error && (
          <div className="rounded-xl border border-[#dc3545]/30 bg-[#dc3545]/10 px-4 py-3 text-sm text-[#dc3545]">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-xl border border-[#0d6efd]/20 bg-[#e3f2fd] px-4 py-3 text-sm text-[#003c68]">
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
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors",
              dragOver
                ? "border-[#003c68] bg-[#e3f2fd]"
                : "border-[#cbd5e1] bg-[#f8f9fa] hover:border-[#003c68] hover:bg-[#eef6ff]",
            ].join(" ")}
          >
            <input
              type="file"
              accept={ACCEPT}
              className="hidden"
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

        {/* メタデータ */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#003c68]">
              タイトル *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-[#dee2e6] bg-white px-3 py-2 text-sm text-[#333333] outline-none transition focus:border-[#003c68] focus:ring-2 focus:ring-[#cfe2ff]"
              placeholder="例：設計基準書_2025-09-10"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[#003c68]">
              カテゴリー
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-[#dee2e6] bg-white px-3 py-2 text-sm text-[#333333] outline-none transition focus:border-[#003c68] focus:ring-2 focus:ring-[#cfe2ff]"
              placeholder="例：設計基準書 / 過去トラ"
              list="category-list"
            />
            <datalist id="category-list">
              <option value="過去トラ" />
              <option value="設計基準書" />
              <option value="技術計算書" />
              <option value="技術標準書" />
            </datalist>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#003c68]">
            サマリー
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="h-32 w-full rounded-xl border border-[#dee2e6] bg-white px-3 py-2 text-sm text-[#333333] outline-none transition focus:border-[#003c68] focus:ring-2 focus:ring-[#cfe2ff]"
            placeholder="概要や検索用の要点など"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center justify-center rounded-full border border-[#dee2e6] px-4 py-2 text-sm text-[#6c757d] transition-colors hover:border-[#003c68] hover:text-[#003c68]"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex items-center justify-center rounded-full bg-[#003c68] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0056a3] disabled:cursor-not-allowed disabled:bg-[#6c757d]"
          >
            {sending ? "アップロード中..." : "アップロード"}
          </button>
        </div>
      </form>
    </div>
  );
}
