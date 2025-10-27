"use client";

import { useEffect } from "react";

const CHAT_KEY = "globalChatPanelOpen";
const SIDEBAR_KEY = "globalSidebarOpen";

function getInitialChatOpen(): boolean {
  try {
    const stored = window.localStorage.getItem(CHAT_KEY);
    if (stored !== null) return stored === "true";
  } catch {}
  return window.innerWidth >= 1024; // desktop default: open
}

function getInitialSidebarOpen(): boolean {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_KEY);
    if (stored !== null) return stored === "true";
  } catch {}
  return true;
}

export default function ShellController() {
  useEffect(() => {
    // let disposed = false;

    const chatPanel = document.querySelector<HTMLElement>("[data-chat-panel]");
    const sidebar = document.querySelector<HTMLElement>("[data-sidebar]");
    const chatToggle =
      document.querySelector<HTMLElement>("[data-chat-toggle]");
    const chatClose =
      chatPanel?.querySelector<HTMLElement>("[data-chat-close]");
    const chatReopen =
      document.querySelector<HTMLElement>("[data-chat-reopen]");
    const sidebarToggle = document.querySelector<HTMLElement>(
      "[data-sidebar-toggle]"
    );

    if (!chatPanel || !sidebar) return;

    // Apply state helpers
    const applyChat = (open: boolean) => {
      chatPanel.classList.toggle("chat-panel--open", open);
      chatPanel.classList.toggle("chat-panel--closed", !open);
      try {
        window.localStorage.setItem(CHAT_KEY, String(open));
      } catch {}
      chatToggle?.setAttribute("aria-pressed", open ? "true" : "false");
    };

    const applySidebar = (open: boolean) => {
      sidebar.dataset.state = open ? "open" : "closed";
      if (open) {
        sidebar.classList.remove("hidden", "lg:hidden");
        sidebar.style.removeProperty("display");
      } else {
        sidebar.classList.add("hidden", "lg:hidden");
        sidebar.style.display = "none";
      }
      sidebarToggle?.setAttribute("aria-pressed", open ? "true" : "false");
      sidebarToggle?.setAttribute("aria-expanded", open ? "true" : "false");
      try {
        window.localStorage.setItem(SIDEBAR_KEY, String(open));
      } catch {}
    };

    // Initialize
    let chatOpen = getInitialChatOpen();
    let sidebarOpen = getInitialSidebarOpen();
    applyChat(chatOpen);
    applySidebar(sidebarOpen);

    // Listeners
    const onChatToggle = () => {
      chatOpen = !chatOpen;
      applyChat(chatOpen);
    };
    const onChatClose = () => {
      chatOpen = false;
      applyChat(chatOpen);
    };
    const onChatReopen = () => {
      chatOpen = true;
      applyChat(chatOpen);
    };
    const onSidebarToggle = () => {
      sidebarOpen = !sidebarOpen;
      applySidebar(sidebarOpen);
    };

    chatToggle?.addEventListener("click", onChatToggle);
    chatClose?.addEventListener("click", onChatClose);
    chatReopen?.addEventListener("click", onChatReopen);
    sidebarToggle?.addEventListener("click", onSidebarToggle);

    // Cleanup
    return () => {
      // disposed = true;
      chatToggle?.removeEventListener("click", onChatToggle);
      chatClose?.removeEventListener("click", onChatClose);
      chatReopen?.removeEventListener("click", onChatReopen);
      sidebarToggle?.removeEventListener("click", onSidebarToggle);
    };
  }, []);

  return null;
}
