// src/app/documents/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/utils/supabase";
import { DocumentCard, type DocumentItem } from "@/components/DocumentCard";

type ApiListResponse = {
  data: DocumentItem[];
  nextCursor?: string | null;
  prevCursor?: string | null;
  total?: number;
};

const PAGE_SIZE = 20;

const SearchIcon = () => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    className="h-4 w-4 text-[#6c757d]"
  >
    <circle cx={11} cy={11} r={6} />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
  </svg>
);

const FilterIcon = () => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    className="h-4 w-4"
  >
    <path
      d="M4 5h16a.5.5 0 0 1 .4.8l-5.9 7.2a1 1 0 0 0-.2.6v4.7l-4.6 1.9V13.6a1 1 0 0 0-.2-.6L3.6 5.8A.5.5 0 0 1 4 5Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ListViewIcon = () => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    className="h-4 w-4"
  >
    <path
      d="M8 7h11M5 7h.01M8 12h11M5 12h.01M8 17h11M5 17h.01"
      strokeLinecap="round"
    />
  </svg>
);

const GridViewIcon = () => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    className="h-4 w-4"
  >
    <rect x={4.5} y={4.5} width={6.5} height={6.5} rx={1.3} />
    <rect x={13} y={4.5} width={6.5} height={6.5} rx={1.3} />
    <rect x={4.5} y={13} width={6.5} height={6.5} rx={1.3} />
    <rect x={13} y={13} width={6.5} height={6.5} rx={1.3} />
  </svg>
);

const UploadIcon = () => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    className="h-4 w-4"
  >
    <path d="M12 16.5v-9" strokeLinecap="round" />
    <path
      d="m8.5 9 3.5-3.5L15.5 9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6 16.5v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3"
      strokeLinecap="round"
    />
  </svg>
);

function DocumentsPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const cursor = search.get("cursor") ?? undefined;

  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [prevCursor, setPrevCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterActive, setFilterActive] = useState(false);

  const iconButtonClass = (active?: boolean) =>
    [
      "inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#dee2e6] text-[#6c757d] transition-colors hover:border-[#003c68] hover:text-[#003c68]",
      active ? "bg-[#e3f2fd] text-[#003c68] border-[#003c68]" : "bg-white",
    ].join(" ");

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

  useEffect(() => {
    if (authed !== true) return;
    let ignore = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const url = new URL("/api/documents", window.location.origin);
        url.searchParams.set("limit", String(PAGE_SIZE));
        if (cursor) url.searchParams.set("cursor", cursor);

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        const res = await fetch(url.toString(), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(`一覧の取得に失敗しました (${res.status})`);
        }
        const json: ApiListResponse = await res.json();
        if (ignore) return;

        setDocs(json.data ?? []);
        setNextCursor(json.nextCursor ?? null);
        setPrevCursor(json.prevCursor ?? null);
        setTotal(json.total);
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
  }, [authed, cursor]);

  const filtered = useMemo(() => {
    const keyword = q.trim();
    if (!keyword) return docs;
    const lower = keyword.toLowerCase();
    return docs.filter((d) => {
      const hay = `${d.title} ${d.summary ?? ""} ${
        d.category ?? ""
      }`.toLowerCase();
      return hay.includes(lower);
    });
  }, [docs, q]);

  if (authed === null) {
    return (
      <div className="flex h-full items-center justify-center text-[#6c757d]">
        読み込み中...
      </div>
    );
  }

  if (authed === false) {
    return null;
  }

  return (
    <div className="mx-auto flex h-full max-w-[1200px] flex-col">
      <nav aria-label="breadcrumb" className="text-sm text-[#6c757d]">
        <ol className="flex items-center gap-2">
          <li className="hover:text-[#003c68]">ホーム</li>
          <li>/</li>
          <li className="text-[#003c68]">ドキュメント</li>
        </ol>
      </nav>

      <div className="mt-4 flex flex-col gap-4 border-b border-[#dee2e6] pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#003c68]">
            ドキュメント一覧
          </h1>
        </div>
        <Link
          href="/documents/new"
          className="inline-flex items-center gap-2 rounded-md bg-[#003c68] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0056a3]"
        >
          <UploadIcon />
          アップロード
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full max-w-md items-center gap-2 rounded-md border border-[#dee2e6] bg-white px-4 py-2 shadow-sm">
          <SearchIcon />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="タイトル・内容・カテゴリを検索"
            className="flex-1 bg-transparent text-sm text-[#333333] placeholder:text-[#6c757d] outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setFilterActive((prev) => !prev)}
            className={iconButtonClass(filterActive).replace(
              "rounded-full",
              "rounded-md"
            )}
            aria-pressed={filterActive}
            title={filterActive ? "フィルター（適用中）" : "フィルター"}
          >
            <FilterIcon />
            <span className="sr-only">フィルター</span>
          </button>
          <span
            className="hidden h-6 w-px bg-[#dee2e6] md:block"
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={iconButtonClass(viewMode === "list").replace(
              "rounded-full",
              "rounded-md"
            )}
            aria-pressed={viewMode === "list"}
            title="リスト表示"
          >
            <ListViewIcon />
            <span className="sr-only">リスト表示</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={iconButtonClass(viewMode === "grid").replace(
              "rounded-full",
              "rounded-md"
            )}
            aria-pressed={viewMode === "grid"}
            title="カード表示"
          >
            <GridViewIcon />
            <span className="sr-only">カード表示</span>
          </button>
        </div>
      </div>

      <section className="mt-6 flex-1 overflow-y-auto pb-10">
        {error && (
          <div className="mb-4 rounded-lg border border-[#dc3545]/30 bg-[#dc3545]/10 px-4 py-3 text-sm text-[#dc3545]">
            {error}
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-xl border border-[#dee2e6] bg-[#f8f9fa]"
              />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && !error && (
          <div className="rounded-xl border border-[#dee2e6] bg-white p-10 text-center shadow-sm">
            <div className="mb-2 text-lg font-medium text-[#333333]">
              ドキュメントはありません
            </div>
            <p className="mb-4 text-sm text-[#6c757d]">
              上部の「ドキュメントをアップロード」から登録を始めましょう。
            </p>
            <Link
              href="/documents/new"
              className="inline-flex items-center gap-2 rounded-md bg-[#003c68] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0056a3]"
            >
              <UploadIcon />
              アップロード
            </Link>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <>
            <div className="mb-3 text-sm text-[#6c757d]">
              {typeof total === "number"
                ? `全${total}件`
                : `${filtered.length}件`}
            </div>
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((doc) => (
                  <DocumentCard key={doc.id} doc={doc} variant="grid" />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-[#dee2e6] bg-white shadow-sm">
                <div className="hidden items-center gap-4 border-b border-[#dee2e6] px-4 py-3 text-xs font-medium uppercase tracking-wide text-[#6c757d] md:grid md:grid-cols-[2fr_1fr_2fr_auto]">
                  <span>タイトル</span>
                  <span>カテゴリ</span>
                  <span>概要</span>
                  <span className="text-right">アップロード日</span>
                </div>
                <div className="divide-y divide-[#f1f3f5]">
                  {filtered.map((doc) => (
                    <DocumentCard key={doc.id} doc={doc} variant="list" />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8 flex justify-center gap-3">
              <button
                disabled={!prevCursor}
                onClick={() =>
                  router.push(
                    prevCursor
                      ? `/documents?cursor=${encodeURIComponent(prevCursor)}`
                      : "/documents"
                  )
                }
                className="rounded-md border border-[#dee2e6] px-4 py-2 text-sm font-medium text-[#333333] transition-colors hover:border-[#003c68] hover:text-[#003c68] disabled:cursor-not-allowed disabled:border-[#dee2e6] disabled:text-[#6c757d]"
              >
                前へ
              </button>
              <button
                disabled={!nextCursor}
                onClick={() =>
                  router.push(
                    nextCursor
                      ? `/documents?cursor=${encodeURIComponent(nextCursor)}`
                      : "/documents"
                  )
                }
                className="rounded-md border border-[#dee2e6] px-4 py-2 text-sm font-medium text-[#333333] transition-colors hover:border-[#003c68] hover:text-[#003c68] disabled:cursor-not-allowed disabled:border-[#dee2e6] disabled:text-[#6c757d]"
              >
                次へ
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-[#6c757d]">
          読み込み中...
        </div>
      }
    >
      <DocumentsPageInner />
    </Suspense>
  );
}
