"use client";

import { FormEvent, useEffect, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { getValidAccessToken } from "@/utils/supabase";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export default function GlobalChatPanel() {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<
    { id: string; title: string | null }[]
  >([]);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const token = await getValidAccessToken();
        const res = await fetch("/api/chat", {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          data?: Array<{ id: string; title?: string | null }>;
        };
        const list = (json?.data ?? []).map((c) => ({
          id: c.id,
          title: c.title ?? "(無題)",
        }));
        if (!ignore) setConversations(list);
      } catch {}
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const loadConversation = async (conversationId: string) => {
    try {
      const token = await getValidAccessToken();
      const res = await fetch(`/api/chat?conversationId=${conversationId}`, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return;
      const json = await res.json();
      const conv = json?.data as {
        messages?: Array<{
          id: string;
          role: "user" | "assistant" | string;
          content: string;
        }>;
      };
      const msgs: ChatMessage[] = (conv?.messages ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
      setMessages(msgs);
      setCurrentConversationId(conversationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "会話の取得に失敗しました");
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    setSending(true);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const token = await getValidAccessToken();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: text,
          conversationId: currentConversationId ?? undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`チャット送信に失敗しました (${res.status}) ${body}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      const assistantId = `assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m
            )
          );
        }
      }

      const newId = res.headers.get("X-Conversation-Id");
      if (newId && !currentConversationId) {
        setCurrentConversationId(newId);
        setConversations((prev) => [
          { id: newId, title: text.slice(0, 50) },
          ...prev,
        ]);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "送信中にエラーが発生しました"
      );
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      data-chat-content
      className="chat-panel__content flex h-full w-full flex-col"
    >
      <div className="flex items-center border-b border-[#dee2e6] px-4 py-3 min-w-0 overflow-x-hidden">
        <div className="relative w-full max-w-full">
          <select
            className="w-full appearance-none rounded-lg border border-[#dee2e6] bg-white px-3 pr-10 py-1 text-sm text-[#333333]"
            value={currentConversationId ?? "new"}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "new") {
                setCurrentConversationId(null);
                setMessages([]);
              } else {
                loadConversation(val);
              }
            }}
          >
            <option value="new">New Chat</option>
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || "(無題)"}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c757d]"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "ml-auto w-fit max-w-[85%] rounded-2xl bg-[#e3f2fd] px-4 py-2 text-sm text-[#003c68]"
                : "w-fit max-w-[85%] rounded-2xl bg-[#f8f9fa] px-4 py-2 text-sm text-[#333333]"
            }
          >
            {m.role === "assistant" ? (
              <span
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(marked.parse(m.content) as string),
                }}
              />
            ) : (
              m.content
            )}
          </div>
        ))}
        {error && (
          <div className="w-fit max-w-[85%] rounded-2xl bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <form
        className="border-t border-[#dee2e6] px-4 py-3"
        data-chat-form
        onSubmit={onSubmit}
      >
        <div className="rounded-xl border border-[#dee2e6] bg-[#f8f9fa]">
          <textarea
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full resize-none rounded-xl bg-transparent px-3 py-2 text-sm text-[#333333] outline-none"
            placeholder="メッセージを入力してください"
            disabled={sending}
          />
          <div className="flex justify-end border-t border-[#dee2e6] px-3 py-2">
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="rounded-xl bg-[#17a2b8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#138496] disabled:cursor-not-allowed disabled:opacity-60"
            >
              送信
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
