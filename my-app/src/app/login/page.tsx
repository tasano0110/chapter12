// src/app/login/page.tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // すでにログイン済みなら一覧へ
  useEffect(() => {
    let ignore = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!ignore && data.session) router.replace("/documents");
    })();
    return () => {
      ignore = true;
    };
  }, [router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSending(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.replace("/documents");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // 本番はメール確認を有効化推奨（Supabase Auth settings）
            emailRedirectTo: `${window.location.origin}/documents`,
          },
        });
        if (error) throw error;
        setInfo("確認メールを送信しました。メールをご確認ください。");
        setMode("signin");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setSending(false);
    }
  };

  const onResetPassword = async () => {
    setError(null);
    setInfo(null);
    if (!email) {
      setError("パスワードリセットにはメールアドレスが必要です。");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      setInfo("パスワード再設定用のメールを送信しました。");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "再設定メールの送信に失敗しました。");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold mb-1">RAG Docs</h1>
        <p className="text-sm text-gray-600 mb-6">
          {mode === "signin"
            ? "ログインして続行してください"
            : "アカウントを作成します"}
        </p>

        {/* タブ */}
        <div className="mb-4 grid grid-cols-2 rounded-lg border p-1 text-sm">
          <button
            onClick={() => setMode("signin")}
            className={`rounded-md py-2 ${
              mode === "signin"
                ? "bg-gray-900 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            ログイン
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`rounded-md py-2 ${
              mode === "signup"
                ? "bg-gray-900 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            新規登録
          </button>
        </div>

        {/* エラー/情報 */}
        {error && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
            {info}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">
              メールアドレス
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">パスワード</label>
            <input
              type="password"
              required={mode === "signin" || mode === "signup"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="8文字以上を推奨"
            />
          </div>

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-lg border bg-gray-900 px-4 py-2 text-white hover:opacity-90 disabled:opacity-60"
          >
            {sending
              ? "処理中..."
              : mode === "signin"
              ? "ログイン"
              : "新規登録"}
          </button>
        </form>

        {mode === "signin" && (
          <div className="mt-4 text-right">
            <button
              onClick={onResetPassword}
              className="text-sm text-blue-600 hover:underline"
            >
              パスワードをお忘れですか？
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
