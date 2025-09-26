import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import type { ReactNode, SVGProps } from "react";

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

const SearchIcon = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    {...props}
  >
    <circle cx={11} cy={11} r={6} />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
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

const SettingsIcon = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    {...props}
  >
    <circle cx={12} cy={12} r={3} />
    <path
      d="m19.4 15.5-.8 1.4a1.2 1.2 0 0 1-1 .6l-1.6.1a6.3 6.3 0 0 1-1 .6l-.3 1.6a1.2 1.2 0 0 1-1.2 1h-1.6a1.2 1.2 0 0 1-1.2-1l-.3-1.6a6.3 6.3 0 0 1-1-.6l-1.6-.1c-.4 0-.8-.3-1-.6l-.8-1.4a1.2 1.2 0 0 1 .2-1.4l1.1-1.2a6.3 6.3 0 0 1 0-1.2l-1.1-1.1a1.2 1.2 0 0 1-.2-1.4l.8-1.4a1.2 1.2 0 0 1 1-.6l1.6-.1a6.3 6.3 0 0 1 1-.6l.3-1.6a1.2 1.2 0 0 1 1.2-1h1.6a1.2 1.2 0 0 1 1.2 1l.3 1.6a6.3 6.3 0 0 1 1 .6l1.6.1c.4 0 .8.3 1 .6l.8 1.4c.2.4.1.9-.2 1.3l-1.1 1.1a6.3 6.3 0 0 1 0 1.2l1.1 1.1c.3.4.4.9.2 1.4z"
      strokeLinejoin="round"
    />
  </svg>
);

const BellIcon = (props: IconProps) => (
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
      d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 17h15z"
      strokeLinejoin="round"
    />
    <path d="M9.5 18.5a2.5 2.5 0 0 0 5 0" strokeLinecap="round" />
  </svg>
);

const UserIcon = (props: IconProps) => (
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

const ChatIcon = (props: IconProps) => (
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
      d="M5 5h14a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H9.6L6 19.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
      strokeLinejoin="round"
    />
    <path d="M9 9.5h6m-6 3h4" strokeLinecap="round" />
  </svg>
);

const MenuIcon = (props: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    {...props}
  >
    <path d="M4 7h16" strokeLinecap="round" />
    <path d="M4 12h16" strokeLinecap="round" />
    <path d="M4 17h16" strokeLinecap="round" />
  </svg>
);

const NAV_ITEMS = [
  {
    label: "ドキュメント",
    href: "/documents",
    icon: DocumentIcon,
  },
  {
    label: "検索",
    href: "/search",
    icon: SearchIcon,
  },
  {
    label: "ドキュメントをアップロード",
    href: "/documents/new",
    icon: UploadIcon,
  },
] as const;

export const metadata: Metadata = {
  title: "AIONA",
  description: "ナレッジマネジメントポータル",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-[#f8f9fa] text-[#333333]">
        <div className="min-h-screen">
          <header className="fixed inset-x-0 top-0 z-50 h-[60px] bg-[#003c68] text-white shadow-sm">
            <div className="flex h-full items-center justify-between px-4 sm:px-6">
              <div className="flex items-center gap-2 text-lg font-semibold tracking-wide">
                <button
                  type="button"
                  title="メニュー"
                  aria-label="サイドバーの開閉"
                  aria-controls="global-sidebar"
                  aria-expanded="true"
                  aria-pressed="true"
                  data-sidebar-toggle
                  className="mr-1 flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[#0056a3] lg:mr-2"
                >
                  <MenuIcon className="h-5 w-5" />
                </button>
                <span>AIONA</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[#0056a3]"
                  title="チャット"
                  data-chat-toggle
                  aria-pressed="true"
                >
                  <ChatIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="hidden h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[#0056a3] sm:flex"
                  title="設定"
                >
                  <SettingsIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="hidden h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[#0056a3] sm:flex"
                  title="通知"
                >
                  <BellIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
                  title="プロフィール"
                >
                  <UserIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </header>

          <div className="flex pt-[60px]">
            <aside
              data-sidebar
              id="global-sidebar"
              data-state="open"
              className="hidden h-[calc(100vh-60px)] w-[250px] flex-shrink-0 border-r border-[#dee2e6] bg-[#f8f9fa] transition-all duration-300 ease-in-out lg:block"
            >
              <nav className="flex h-full flex-col py-4">
                {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    data-nav-item
                    data-href={href}
                    className="nav-link group relative flex h-[45px] items-center gap-3 px-6 text-sm font-medium text-[#333333]/80 transition-colors hover:bg-[#f0f0f0]"
                  >
                    <span className="nav-link-indicator" aria-hidden="true" />
                    <Icon className="h-5 w-5" />
                    <span>{label}</span>
                  </Link>
                ))}
              </nav>
            </aside>

            <main className="flex-1 bg-white">
              <div className="flex h-[calc(100vh-60px)] flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                  {children}
                </div>
              </div>
            </main>

            <section
              data-chat-panel
              className="chat-panel chat-panel--open relative flex h-[calc(100vh-60px)] flex-col overflow-hidden border-l border-[#dee2e6] bg-white transition-all duration-300 ease-in-out"
            >
              <div
                data-chat-reopen-wrapper
                className="chat-reopen-wrapper absolute left-[-44px] top-5 lg:hidden"
              >
                <button
                  type="button"
                  data-chat-reopen
                  title="チャットを開く"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#003c68] text-white shadow-lg"
                >
                  <ChatIcon className="h-5 w-5" />
                </button>
              </div>

              <div
                data-chat-content
                className="chat-panel__content flex h-full w-full flex-col"
              >
                <div className="flex items-center justify-between border-b border-[#dee2e6] px-4 py-3">
                  <select className="rounded-full border border-[#dee2e6] bg-white px-3 py-1 text-sm text-[#333333]">
                    <option>New Chat</option>
                    <option>Marketing</option>
                    <option>プロジェクトA</option>
                  </select>
                  <button
                    type="button"
                    data-chat-close
                    className="rounded-full border border-[#dee2e6] px-3 py-1 text-sm text-[#6c757d] transition-colors hover:border-[#003c68] hover:text-[#003c68]"
                  >
                    閉じる
                  </button>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  <div className="ml-auto w-fit max-w-[85%] rounded-2xl bg-[#e3f2fd] px-4 py-2 text-sm text-[#003c68]">
                    こんにちは！ドキュメントに関する質問があればこちらでどうぞ。
                  </div>
                  <div className="w-fit max-w-[85%] rounded-2xl bg-[#f8f9fa] px-4 py-2 text-sm text-[#333333]">
                    チームの最新ナレッジを共有するには「ドキュメントをアップロード」から追加できます。
                  </div>
                </div>
                <form
                  className="border-t border-[#dee2e6] px-4 py-3"
                  data-chat-form
                >
                  <div className="rounded-2xl border border-[#dee2e6] bg-[#f8f9fa]">
                    <textarea
                      rows={3}
                      className="w-full resize-none rounded-2xl bg-transparent px-3 py-2 text-sm text-[#333333] outline-none"
                      placeholder="メッセージを入力してください"
                    />
                    <div className="flex justify-end border-t border-[#dee2e6] px-3 py-2">
                      <button
                        type="submit"
                        className="rounded-full bg-[#17a2b8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#138496]"
                      >
                        送信
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </section>
          </div>
        </div>

        <Script id="shared-layout-behavior" strategy="afterInteractive">
          {`
            (() => {
              const CHAT_STORAGE_KEY = "globalChatPanelOpen";
              const SIDEBAR_STORAGE_KEY = "globalSidebarOpen";
              const chatPanel = document.querySelector('[data-chat-panel]');
              const sidebar = document.querySelector('[data-sidebar]');
              if (!chatPanel) return;

              const toggleButton = document.querySelector('[data-chat-toggle]');
              const closeButton = chatPanel.querySelector('[data-chat-close]');
              const reopenButton = chatPanel.querySelector('[data-chat-reopen]');
              const chatForm = chatPanel.querySelector('[data-chat-form]');
              const sidebarToggle = document.querySelector('[data-sidebar-toggle]');

              const applyState = (open) => {
                chatPanel.classList.toggle('chat-panel--open', open);
                chatPanel.classList.toggle('chat-panel--closed', !open);
                if (toggleButton) {
                  toggleButton.setAttribute('aria-pressed', open ? 'true' : 'false');
                }
              };

              let isOpen = true;
              try {
                const stored = window.localStorage.getItem(CHAT_STORAGE_KEY);
                if (stored !== null) {
                  isOpen = stored === 'true';
                } else if (window.innerWidth < 1024) {
                  isOpen = false;
                }
              } catch (error) {
                // localStorage access failed; ignore
              }

              applyState(isOpen);

              const setState = (next) => {
                isOpen = next;
                applyState(isOpen);
                try {
                  window.localStorage.setItem(CHAT_STORAGE_KEY, String(isOpen));
                } catch (error) {
                  // localStorage access failed; ignore
                }
              };

              toggleButton?.addEventListener('click', () => {
                setState(!isOpen);
              });

              closeButton?.addEventListener('click', () => {
                setState(false);
              });

              reopenButton?.addEventListener('click', () => {
                setState(true);
              });

              chatForm?.addEventListener('submit', (event) => {
                event.preventDefault();
              });

              const navItems = document.querySelectorAll('[data-nav-item]');
              const currentPath = window.location.pathname;
              navItems.forEach((item) => {
                const target = item.getAttribute('data-href');
                if (!target) return;
                if (currentPath === target || currentPath.startsWith(target + '/')) {
                  item.classList.add('nav-link--active');
                }
              });

              // --- Sidebar open/close persistence and toggle ---
              const applySidebarState = (open) => {
                if (!sidebar) return;
                sidebar.dataset.state = open ? 'open' : 'closed';
                if (open) {
                  sidebar.classList.remove('hidden', 'lg:hidden');
                  sidebar.style.removeProperty('display');
                } else {
                  sidebar.classList.add('hidden', 'lg:hidden');
                  sidebar.style.display = 'none';
                }
                if (sidebarToggle) {
                  sidebarToggle.setAttribute('aria-pressed', open ? 'true' : 'false');
                  sidebarToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
                }
              };

              let isSidebarOpen = true;
              try {
                const storedSidebar = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
                if (storedSidebar !== null) {
                  isSidebarOpen = storedSidebar === 'true';
                }
              } catch (error) {
                // ignore
              }
              applySidebarState(isSidebarOpen);

              const setSidebarState = (next) => {
                isSidebarOpen = next;
                applySidebarState(isSidebarOpen);
                try {
                  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isSidebarOpen));
                } catch (error) {
                  // ignore
                }
              };

              sidebarToggle?.addEventListener('click', () => {
                setSidebarState(!isSidebarOpen);
              });
            })();
          `}
        </Script>
      </body>
    </html>
  );
}
