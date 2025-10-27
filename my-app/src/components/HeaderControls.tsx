"use client";

import { useEffect } from "react";

const CHAT_KEY = "globalChatPanelOpen";
const SIDEBAR_KEY = "globalSidebarOpen";

function ensureInitialStates() {
  const chatPanel = document.querySelector<HTMLElement>("[data-chat-panel]");
  const sidebar = document.querySelector<HTMLElement>("[data-sidebar]");
  if (!chatPanel || !sidebar) return;
  let chatOpen = true;
  try {
    const stored = window.localStorage.getItem(CHAT_KEY);
    if (stored !== null) chatOpen = stored === "true";
    else if (window.innerWidth < 1024) chatOpen = false;
  } catch {}
  chatPanel.classList.toggle("chat-panel--open", chatOpen);
  chatPanel.classList.toggle("chat-panel--closed", !chatOpen);

  let sidebarOpen = true;
  try {
    const stored = window.localStorage.getItem(SIDEBAR_KEY);
    if (stored !== null) sidebarOpen = stored === "true";
  } catch {}
  sidebar.dataset.state = sidebarOpen ? "open" : "closed";
  if (sidebarOpen) {
    sidebar.classList.remove("hidden", "lg:hidden");
    sidebar.style.removeProperty("display");
  } else {
    sidebar.classList.add("hidden", "lg:hidden");
    sidebar.style.display = "none";
  }
}

export default function HeaderControls() {
  useEffect(() => {
    ensureInitialStates();
  }, []);

  const onToggleChat = () => {
    const chatPanel = document.querySelector<HTMLElement>("[data-chat-panel]");
    if (!chatPanel) return;
    const open = !chatPanel.classList.contains("chat-panel--open");
    chatPanel.classList.toggle("chat-panel--open", open);
    chatPanel.classList.toggle("chat-panel--closed", !open);
    try {
      window.localStorage.setItem(CHAT_KEY, String(open));
    } catch {}
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[#0056a3]"
        title="チャット"
        onClick={onToggleChat}
      >
        <svg
          viewBox="0 0 24 24"
          role="img"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          className="h-5 w-5"
        >
          <path
            d="M5 5h14a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H9.6L6 19.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
            strokeLinejoin="round"
          />
          <path d="M9 9.5h6m-6 3h4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
