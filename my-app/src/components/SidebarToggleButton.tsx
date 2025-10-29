"use client";

export default function SidebarToggleButton() {
  const onToggleSidebar = () => {
    const sidebar = document.querySelector<HTMLElement>("[data-sidebar]");
    const shell = document.querySelector<HTMLElement>("[data-shell]");
    if (!sidebar || !shell) return;
    const isOpen = sidebar.dataset.state !== "closed";
    const next = !isOpen;
    sidebar.dataset.state = next ? "open" : "closed";

    // サイドバーの表示/非表示を切り替え
    if (next) {
      sidebar.classList.remove("hidden", "lg:hidden");
      sidebar.style.removeProperty("display");
      // グリッドレイアウトを3カラムに変更
      shell.className = shell.className.replace(
        /grid-cols-\[.*?\]/,
        "grid-cols-[250px_minmax(0,1fr)_auto]"
      );
    } else {
      sidebar.classList.add("hidden", "lg:hidden");
      sidebar.style.display = "none";
      // グリッドレイアウトを2カラムに変更（サイドバーの列を削除）
      shell.className = shell.className.replace(
        /grid-cols-\[.*?\]/,
        "grid-cols-[minmax(0,1fr)_auto]"
      );
    }
    try {
      window.localStorage.setItem("globalSidebarOpen", String(next));
    } catch {}
  };

  return (
    <button
      type="button"
      title="メニュー"
      aria-label="サイドバーの開閉"
      aria-controls="global-sidebar"
      aria-expanded="true"
      aria-pressed="true"
      onClick={onToggleSidebar}
      className="mr-1 flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[#0056a3] lg:mr-2"
    >
      <svg
        viewBox="0 0 24 24"
        role="img"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-5 w-5"
      >
        <path d="M4 7h16" strokeLinecap="round" />
        <path d="M4 12h16" strokeLinecap="round" />
        <path d="M4 17h16" strokeLinecap="round" />
      </svg>
    </button>
  );
}













