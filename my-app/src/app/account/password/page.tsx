"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/utils/supabase";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (ignore) return;
      if (!data.session) {
        router.replace("/login");
        setAuthChecked(true);
        return;
      }
      setEmail(data.session.user.email ?? null);
      setAuthChecked(true);
    })();
    return () => {
      ignore = true;
    };
  }, [router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);

    if (!email) {
      setError(
        "メールアドレスの取得に失敗しました。再度ログインし直してください。"
      );
      return;
    }
    if (!currentPassword) {
      setError("現在のパスワードを入力してください。");
      return;
    }
    if (newPassword.length < 8) {
      setError("新しいパスワードは8文字以上にしてください。");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("新しいパスワードが一致しません。");
      return;
    }
    if (newPassword === currentPassword) {
      setError("新しいパスワードが現在のパスワードと同じです。");
      return;
    }

    setSubmitting(true);
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthError) {
        throw new Error("現在のパスワードが正しくありません。");
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        throw new Error(
          updateError.message || "パスワードの更新に失敗しました。"
        );
      }

      await supabase.auth.refreshSession();

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setInfo("パスワードを更新しました。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました。");
    } finally {
      setSubmitting(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="flex h-full items-center justify-center text-[#6c757d]">
        認証状態を確認しています...
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <nav aria-label="breadcrumb" className="text-sm text-[#6c757d]">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/documents" className="hover:text-[#003c68]">
              ドキュメント
            </Link>
          </li>
          <li>/</li>
          <li className="hover:text-[#003c68]">
            <button type="button" onClick={() => router.back()}>
              アカウント設定
            </button>
          </li>
          <li>/</li>
          <li className="text-[#003c68]">パスワード変更</li>
        </ol>
      </nav>

      <div className="mt-6 rounded-xl border border-[#dee2e6] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#003c68]">
          パスワードの変更
        </h1>
        <p className="mt-2 text-sm text-[#6c757d]">
          セキュリティ向上のため、定期的なパスワード更新をおすすめします。
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-5">
          {error && (
            <div className="rounded-md bg-[#dc3545]/10 px-4 py-3 text-sm text-[#dc3545]">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-md bg-[#198754]/10 px-4 py-3 text-sm text-[#0f5132]">
              {info}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-[#333333]">
              現在のパスワード
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-[#ced4da] px-3 py-2 text-sm text-[#333333] outline-none focus:ring-2 focus:ring-[#003c68]"
              placeholder="現在のパスワード"
              autoComplete="current-password"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#333333]">
              新しいパスワード
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-[#ced4da] px-3 py-2 text-sm text-[#333333] outline-none focus:ring-2 focus:ring-[#003c68]"
              placeholder="8文字以上"
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-[#6c757d]">
              8文字以上で英数字や記号の組み合わせを推奨します。
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#333333]">
              新しいパスワード（確認用）
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-[#ced4da] px-3 py-2 text-sm text-[#333333] outline-none focus:ring-2 focus:ring-[#003c68]"
              placeholder="新しいパスワードを再入力"
              autoComplete="new-password"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/documents"
              className="rounded-full border border-[#dee2e6] px-4 py-2 text-sm font-medium text-[#333333] transition-colors hover:border-[#003c68] hover:text-[#003c68]"
            >
              キャンセル
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-[#003c68] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0056a3] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "更新しています..." : "パスワードを更新"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
