"use client";

import { useEffect, useRef, useState } from "react";
import type { SVGProps } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabase";

const UserIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    {...props}
  >
    <circle cx={12} cy={8.5} r={3.5} />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
  </svg>
);

export function AccountMenu() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (ignore) return;
      setEmail(data.user?.email ?? null);
    })();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  const onLogout = async () => {
    setPending(true);
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message || "ログアウトに失敗しました。");
      setPending(false);
      return;
    }
    router.replace("/login");
    router.refresh();
  };

  const onChangePassword = () => {
    setOpen(false);
    router.push("/account/password");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
          open ? "bg-white/20" : "bg-white/10 hover:bg-white/20"
        }`}
        title="アカウントメニュー"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <UserIcon className="h-5 w-5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-lg border border-[#dee2e6] bg-white py-2 text-sm text-[#333333] shadow-lg"
        >
          <div className="border-b border-[#f1f3f5] px-4 pb-3">
            <div className="text-xs text-[#6c757d]">ログイン中のアカウント</div>
            <div className="truncate text-sm font-medium text-[#003c68]">
              {email ?? "取得中..."}
            </div>
          </div>

          {error && (
            <div className="mx-4 mt-2 rounded-md bg-[#dc3545]/10 px-3 py-2 text-xs text-[#dc3545]">
              {error}
            </div>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={onChangePassword}
            className="mt-2 flex w-full items-center justify-between px-4 py-2 text-left transition-colors hover:bg-[#f8f9fa]"
          >
            <span>パスワードを変更</span>
            <span aria-hidden className="text-xs text-[#6c757d]">
              →
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            disabled={pending}
            className={`mt-1 flex w-full items-center justify-between px-4 py-2 text-left transition-colors ${
              pending ? "cursor-not-allowed text-[#6c757d]" : "hover:bg-[#f8f9fa]"
            }`}
          >
            <span>{pending ? "ログアウト中..." : "ログアウト"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
