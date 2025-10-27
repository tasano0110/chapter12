"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const DocumentIcon = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    {...props}
  >
    <path
      d="M7 3.5h7.17L19.5 8.83V20.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"
      strokeLinejoin="round"
    />
    <path d="M14 3.5v5h5" strokeLinejoin="round" />
    <path d="M9 13h6M9 16.5h6" strokeLinecap="round" />
  </svg>
);

const UploadIcon = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    {...props}
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

const NAV_ITEMS = [
  { label: "ドキュメント", href: "/documents", Icon: DocumentIcon },
  { label: "アップロード", href: "/documents/new", Icon: UploadIcon },
] as const;

function isActivePath(current: string, target: string): boolean {
  const norm = (p: string) => (p || "/").replace(/\/+$/, "") || "/";
  const c = norm(current);
  const t = norm(target);
  // 完全一致のみをアクティブにする（親ディレクトリは反応させない）
  return c === t;
}

export default function SidebarNav() {
  const pathname = usePathname() || "/";

  return (
    <nav className="flex h-full flex-col py-4">
      {NAV_ITEMS.map(({ label, href, Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            data-nav-item
            data-href={href}
            className={[
              "nav-link group relative flex h-[45px] items-center gap-3 px-6 text-sm font-medium transition-colors",
              active
                ? "nav-link--active text-[#003c68]"
                : "text-[#333333]/80 hover:bg-[#f0f0f0]",
            ].join(" ")}
          >
            <span className="nav-link-indicator" aria-hidden="true" />
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
