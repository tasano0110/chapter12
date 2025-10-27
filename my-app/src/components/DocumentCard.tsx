// src/components/DocumentCard.tsx
import Link from "next/link";

export type DocumentItem = {
  id: string;
  title: string;
  summary?: string | null;
  category?: string | null;
  uploadedAt?: string; // ISO string を想定
};

type DocumentCardProps = {
  doc: DocumentItem;
  variant?: "grid" | "list";
};

export function DocumentCard({ doc, variant = "grid" }: DocumentCardProps) {
  const date = doc.uploadedAt
    ? new Date(doc.uploadedAt).toLocaleString("ja-JP")
    : "-";

  if (variant === "list") {
    return (
      <Link
        href={`/documents/${doc.id}`}
        className="flex flex-col gap-2 px-4 py-3 text-sm text-[#333333] transition-colors hover:bg-[#f8f9fa] md:grid md:grid-cols-[2fr_1fr_2fr_auto] md:items-center"
      >
        <div>
          <div className="line-clamp-1 font-semibold text-[#003c68]">
            {doc.title}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-[#6c757d] md:hidden">
            <span>{doc.category ?? "未分類"}</span>
            <span aria-hidden="true">•</span>
            <span>{date}</span>
          </div>
          {doc.summary && (
            <p className="mt-1 line-clamp-2 text-xs text-[#6c757d] md:hidden">
              {doc.summary}
            </p>
          )}
        </div>
        <div className="hidden text-sm text-[#6c757d] md:block">
          {doc.category ?? "未分類"}
        </div>
        <div className="hidden text-sm text-[#6c757d] md:block md:pl-4 line-clamp-1">
          {doc.summary ?? "概要はまだありません"}
        </div>
        <div className="hidden text-sm text-[#6c757d] md:block text-right">
          {date}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/documents/${doc.id}`}
      className="block rounded-xl border border-[#dee2e6] bg-white p-4 transition-shadow hover:shadow-md"
    >
      <div className="mb-1 text-xs text-[#6c757d]">
        {doc.category ?? "未分類"}
      </div>
      <h3 className="line-clamp-1 text-base font-semibold text-[#003c68]">
        {doc.title}
      </h3>
      {doc.summary && (
        <p className="mt-2 line-clamp-2 text-sm text-[#495057]">{doc.summary}</p>
      )}
      <div className="mt-3 text-xs text-[#6c757d]">アップロード：{date}</div>
    </Link>
  );
}
