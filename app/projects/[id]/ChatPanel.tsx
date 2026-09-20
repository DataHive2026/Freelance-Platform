"use client";

import { useState, useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { sendMessageServerAction } from "./actions";

interface Message {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  senderEmail: string;
}

export function ChatPanel({
  projectId,
  conversationId,
  initialMessages,
  currentUserId,
}: {
  projectId: string;
  conversationId: string;
  initialMessages: Message[];
  currentUserId: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Realtime subscription — the messages table was added to the
  // supabase_realtime publication in 0005_realtime_messages.sql, and
  // who's allowed to receive these events is governed by the
  // "messages_read_if_participant" RLS policy from
  // 0002_auth_integration.sql (this uses the anon-key browser client,
  // which DOES respect RLS — unlike the service-role client used
  // server-side for Storage in Phase 9).
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as { id: string; content: string; created_at: string; sender_id: string };
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev; // already have it via optimistic send
            return [...prev, { ...row, senderEmail: row.sender_id === currentUserId ? "you" : "team member" }];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    if (!draft.trim() || sending) return;
    const content = draft.trim();
    setDraft("");
    setSending(true);

    // Optimistic append — the Realtime event for this same row will
    // arrive moments later and get de-duped by id in the handler above.
    const optimisticId = `optimistic-${Date.now()}`;
    setMessages((prev) => [...prev, { id: optimisticId, content, created_at: new Date().toISOString(), sender_id: currentUserId, senderEmail: "you" }]);

    const result = await sendMessageServerAction(projectId, content);
    setSending(false);
    if (result.error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      alert(result.error);
    }
  };

  return (
    <div style={{ border: "1px solid #E2E4EA", borderRadius: 12, display: "flex", flexDirection: "column", height: 320 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {messages.length === 0 && <p style={{ fontSize: 12, color: "#9AA0AF" }}>No messages yet — say hello.</p>}
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#9AA0AF" }}>
              {m.sender_id === currentUserId ? "You" : m.senderEmail} · {new Date(m.created_at).toLocaleTimeString()}
            </div>
            <div style={{ fontSize: 13 }}>{m.content}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid #E2E4EA" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message the team..."
          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E4EA", fontSize: 13 }}
        />
        <button
          onClick={send}
          disabled={sending}
          style={{ background: "#3454D1", color: "white", padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
