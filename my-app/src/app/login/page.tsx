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
  useEffect(() => {
    // Hide global chrome (header/sidebar) when on the login page
    const header = document.querySelector(
      "[data-header]"
    ) as HTMLElement | null;
    const shell = document.querySelector("[data-shell]") as HTMLElement | null;
    const sidebar = document.querySelector(
      "[data-sidebar]"
    ) as HTMLElement | null;
    const chatPanel = document.querySelector(
      "[data-chat-panel]"
    ) as HTMLElement | null;
    const mainEl = document.querySelector("main") as HTMLElement | null;
    const mainInner = mainEl?.querySelector(
      ":scope > div"
    ) as HTMLElement | null;
    const scrollArea = mainInner?.querySelector(
      ":scope > div"
    ) as HTMLElement | null; // flex-1 overflow-y-auto ...
    const restore: Array<() => void> = [];
    if (header) {
      const prev = header.style.display;
      header.style.display = "none";
      restore.push(() => (header.style.display = prev));
    }
    if (sidebar) {
      const prev = sidebar.style.display;
      sidebar.style.display = "none";
      restore.push(() => (sidebar.style.display = prev));
    }
    if (chatPanel) {
      const prev = chatPanel.style.display;
      chatPanel.style.display = "none";
      restore.push(() => (chatPanel.style.display = prev));
    }
    if (shell) {
      const prevPadding = shell.style.paddingTop;
      const prevBg = shell.style.backgroundColor;
      shell.style.paddingTop = "0px";
      shell.style.backgroundColor = "#f8f9fa";
      restore.push(() => (shell.style.paddingTop = prevPadding));
      restore.push(() => (shell.style.backgroundColor = prevBg));
    }
    if (mainEl) {
      const prevBg = mainEl.style.backgroundColor;
      mainEl.style.backgroundColor = "#f8f9fa";
      restore.push(() => (mainEl.style.backgroundColor = prevBg));
    }
    if (mainInner) {
      const prevHeight = mainInner.style.height;
      mainInner.style.height = "100vh";
      restore.push(() => (mainInner.style.height = prevHeight));
    }
    if (scrollArea) {
      const prevOverflow = scrollArea.style.overflowY;
      const prevPadding = scrollArea.style.padding;
      const prevHeight = scrollArea.style.height;
      scrollArea.style.overflowY = "hidden";
      scrollArea.style.padding = "0";
      scrollArea.style.height = "100vh";
      restore.push(() => (scrollArea.style.overflowY = prevOverflow));
      restore.push(() => (scrollArea.style.padding = prevPadding));
      restore.push(() => (scrollArea.style.height = prevHeight));
    }
    return () => {
      restore.forEach((fn) => fn());
    };
  }, []);
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
      setError(
        err instanceof Error
          ? err.message
          : "再設定メールの送信に失敗しました。"
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] px-4">
      <div className="w-full max-w-md rounded-xl border border-[#dee2e6] bg-white p-6 shadow-sm">
        <p className="mb-6 text-sm text-[#6c757d]">
          {mode === "signin"
            ? "ログインして続行してください"
            : "アカウントを作成します"}
        </p>

        {/* タブ */}
        <div className="mb-4 grid grid-cols-2 rounded-lg border border-[#dee2e6] p-1 text-sm">
          <button
            onClick={() => setMode("signin")}
            className={`rounded-md py-2 ${
              mode === "signin"
                ? "bg-[#003c68] text-white"
                : "text-[#333333] hover:bg-[#eef6ff]"
            }`}
          >
            ログイン
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`rounded-md py-2 ${
              mode === "signup"
                ? "bg-[#003c68] text-white"
                : "text-[#333333] hover:bg-[#eef6ff]"
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
          <div className="mb-3 rounded-md bg-[#e3f2fd] px-3 py-2 text-sm text-[#003c68]">
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
              className="w-full rounded-lg border border-[#dee2e6] px-3 py-2 outline-none focus:border-[#003c68] focus:ring-2 focus:ring-[#cfe2ff]"
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
              className="w-full rounded-lg border border-[#dee2e6] px-3 py-2 outline-none focus:border-[#003c68] focus:ring-2 focus:ring-[#cfe2ff]"
              placeholder="8文字以上を推奨"
            />
          </div>

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-full bg-[#003c68] px-4 py-2 text-white transition-colors hover:bg-[#0056a3] disabled:cursor-not-allowed disabled:bg-[#6c757d]"
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
              className="text-sm text-[#003c68] hover:underline"
            >
              パスワードをお忘れですか？
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
