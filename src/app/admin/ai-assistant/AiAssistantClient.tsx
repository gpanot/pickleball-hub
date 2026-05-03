"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  model?: string;
}

interface ContextMeta {
  builtAt: string;
  sessionCount: number;
  venueCount: number;
  clubCount: number;
  estimatedTokens: number;
}

interface ConversationSession {
  sessionId: string;
  startedAt: string;
  messageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  contextMeta: ContextMeta | null;
  messages: {
    id: string;
    role: string;
    content: string;
    inputTokens: number | null;
    outputTokens: number | null;
    estimatedCostUsd: number | null;
    createdAt: string;
  }[];
}

// ─── Session storage keys ─────────────────────────────────────────────────────
const STORAGE_KEY_SESSION_ID = "ai_assistant_session_id";
const STORAGE_KEY_MESSAGES   = "ai_assistant_messages";
const STORAGE_KEY_CONTEXT    = "ai_assistant_context_meta";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCost(usd: number) {
  if (usd < 0.000001) return "$0.000000";
  return `$${usd.toFixed(6)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

function shortModel(model: string): string {
  if (model === "deepseek-chat") return "deepseek-v3";
  if (model.includes("haiku")) return "haiku-4.5";
  if (model.includes("sonnet")) return "sonnet-4.6";
  if (model.includes("opus")) return "opus-4.6";
  return model.replace(/^claude-/, "").replace(/-(\d+)-(\d+)-\d+$/, "-$1.$2");
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AiAssistantClient() {
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMeta, setContextMeta] = useState<ContextMeta | null>(null);

  const [logsOpen, setLogsOpen] = useState(false);
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteToast, setDeleteToast] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Restore from sessionStorage on mount ────────────────────────────────────
  useEffect(() => {
    try {
      const storedId      = sessionStorage.getItem(STORAGE_KEY_SESSION_ID);
      const storedMsgs    = sessionStorage.getItem(STORAGE_KEY_MESSAGES);
      const storedContext = sessionStorage.getItem(STORAGE_KEY_CONTEXT);

      if (storedId) {
        setSessionId(storedId);
      } else {
        const newId = crypto.randomUUID();
        setSessionId(newId);
        sessionStorage.setItem(STORAGE_KEY_SESSION_ID, newId);
      }

      if (storedMsgs) {
        setMessages(JSON.parse(storedMsgs) as Message[]);
      }
      if (storedContext) {
        setContextMeta(JSON.parse(storedContext) as ContextMeta);
      }
    } catch {
      // sessionStorage unavailable — generate fresh session
      setSessionId(crypto.randomUUID());
    }
  }, []);

  // ── Persist messages + context to sessionStorage whenever they change ────────
  useEffect(() => {
    if (!sessionId) return;
    try {
      sessionStorage.setItem(STORAGE_KEY_SESSION_ID, sessionId);
      sessionStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    } catch { /* ignore quota errors */ }
  }, [sessionId, messages]);

  useEffect(() => {
    if (contextMeta === null) return;
    try {
      sessionStorage.setItem(STORAGE_KEY_CONTEXT, JSON.stringify(contextMeta));
    } catch { /* ignore */ }
  }, [contextMeta]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── New chat — archive current conversation, start fresh ─────────────────────
  const startNewChat = useCallback(() => {
    // The current session is already saved to DB (each message is logged on send).
    // We just reset client state and refresh the logs panel so it appears there.
    const newId = crypto.randomUUID();
    setMessages([]);
    setSessionId(newId);
    setContextMeta(null);
    setError(null);
    setLogsOpen(true);
    // Reload logs so the just-finished conversation appears
    setLogsLoading(true);
    fetch("/api/admin/ai-assistant/logs")
      .then((r) => r.json())
      .then((d: { sessions: ConversationSession[] }) => setSessions(d.sessions ?? []))
      .catch(() => {})
      .finally(() => setLogsLoading(false));
    try {
      sessionStorage.removeItem(STORAGE_KEY_SESSION_ID);
      sessionStorage.removeItem(STORAGE_KEY_MESSAGES);
      sessionStorage.removeItem(STORAGE_KEY_CONTEXT);
    } catch { /* ignore */ }
    inputRef.current?.focus();
  }, []);

  // ── Load logs ────────────────────────────────────────────────────────────────
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch("/api/admin/ai-assistant/logs");
      const data = await res.json() as { sessions: ConversationSession[] };
      setSessions(data.sessions ?? []);
    } catch {
      // ignore
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const toggleLogs = useCallback(() => {
    if (!logsOpen) loadLogs();
    setLogsOpen((v) => !v);
  }, [logsOpen, loadLogs]);

  const deleteAllLogs = useCallback(async () => {
    setShowDeleteConfirm(false);
    try {
      await fetch("/api/admin/ai-assistant/logs", { method: "DELETE" });
      setSessions([]);
      setDeleteToast(true);
      window.setTimeout(() => setDeleteToast(false), 3000);
    } catch {
      // ignore
    }
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading || !sessionId) return;

    const userMsg: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/admin/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          sessionId,
        }),
      });

      const data = await res.json() as {
        content?: string;
        error?: string;
        usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number; model?: string; };
        contextMeta?: ContextMeta | null;
      };

      if (!res.ok) {
        setError(data.error ?? "Unknown error");
        return;
      }

      const assistantMsg: Message = {
        role: "assistant",
        content: data.content ?? "",
        inputTokens: data.usage?.inputTokens,
        outputTokens: data.usage?.outputTokens,
        estimatedCostUsd: data.usage?.estimatedCostUsd,
        model: data.usage?.model,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      if (data.contextMeta) {
        setContextMeta(data.contextMeta);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, sessionId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
        <div>
          <h1 className="text-sm font-semibold text-white">AI Assistant</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            HCM pickleball data · {messages.length} message{messages.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={startNewChat}
          className="text-xs text-gray-400 hover:text-white transition px-3 py-1.5 rounded border border-gray-700 hover:border-gray-500 flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8V1.5Z" />
          </svg>
          New chat
        </button>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-3xl mb-3">🏓</div>
            <p className="text-gray-400 text-sm max-w-sm">
              Ask anything about HCM pickleball — venues, upcoming sessions, clubs, or skill levels.
            </p>
            <p className="text-gray-600 text-xs mt-2">
              Internal testing only · Powered by Claude
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className="max-w-[75%]">
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-emerald-600 text-white rounded-br-sm"
                    : "bg-gray-800 text-gray-100 rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
              {msg.role === "assistant" && msg.inputTokens != null && (
                <p className="text-[10px] text-gray-600 mt-1 px-1">
                  {msg.model && (
                    <span className="text-gray-500 mr-1.5">{shortModel(msg.model)}</span>
                  )}
                  {msg.inputTokens.toLocaleString()} in · {msg.outputTokens?.toLocaleString()} out ·{" "}
                  {formatCost(msg.estimatedCostUsd ?? 0)}
                </p>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center">
            <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-2 text-xs text-red-300 max-w-lg">
              {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 px-6 py-4 border-t border-gray-800 bg-gray-950">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about venues, sessions, clubs…"
            rows={1}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-emerald-600 transition leading-relaxed"
            style={{ minHeight: "44px", maxHeight: "120px" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = Math.min(t.scrollHeight, 120) + "px";
            }}
            disabled={isLoading}
            autoFocus
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium px-4 py-3 rounded-xl transition shrink-0"
          >
            Send
          </button>
        </div>
        <p className="text-[10px] text-gray-700 mt-2">
          Enter to send · Shift+Enter for new line{sessionId ? ` · Session: ${sessionId.slice(0, 8)}…` : ""}
        </p>
        {contextMeta && (
          <p className="text-[10px] text-gray-600 mt-1">
            Context:{" "}
            {new Date(contextMeta.builtAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: "Asia/Ho_Chi_Minh",
            })}{" "}
            · {contextMeta.sessionCount} sessions · {contextMeta.venueCount} venues ·{" "}
            {contextMeta.clubCount} clubs
            {contextMeta.estimatedTokens > 0 && (
              <> · ~{contextMeta.estimatedTokens.toLocaleString()} tokens</>
            )}
          </p>
        )}
      </div>

      {/* Delete-all confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-sm font-semibold text-white mb-2">Delete all conversations?</h3>
            <p className="text-xs text-gray-400 leading-relaxed mb-6">
              This will permanently delete all AI assistant logs from the database. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-xs font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={deleteAllLogs}
                className="px-4 py-2 text-xs font-medium text-red-400 border border-red-500/50 hover:bg-red-500/10 rounded-lg transition"
              >
                Delete all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent conversations section */}
      <div className="shrink-0 border-t border-gray-800">
        <div className="flex items-center">
          <button
            onClick={toggleLogs}
            className="flex-1 flex items-center justify-between px-6 py-3 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-900 transition"
          >
            <span className="font-medium tracking-wide uppercase">Recent conversations</span>
            <span className="text-gray-600">{logsOpen ? "▲" : "▼"}</span>
          </button>
          {sessions.length > 0 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="mr-4 px-2.5 py-1 text-[10px] font-medium text-red-500 border border-red-500/40 hover:bg-red-500/10 rounded-md transition shrink-0"
            >
              Delete all
            </button>
          )}
        </div>

        {logsOpen && (
          <div className="border-t border-gray-800 max-h-80 overflow-y-auto">
            {logsLoading ? (
              <p className="text-xs text-gray-600 px-6 py-4">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-gray-600 px-6 py-4">No conversations yet.</p>
            ) : (
              <div className="divide-y divide-gray-800/50">
                {sessions.map((s) => (
                  <div key={s.sessionId} className="px-6 py-3">
                    <button
                      onClick={() =>
                        setExpandedSession(
                          expandedSession === s.sessionId ? null : s.sessionId,
                        )
                      }
                      className="w-full flex items-center justify-between text-left group"
                    >
                      <div>
                        <p className="text-xs text-gray-300 group-hover:text-white transition">
                          {formatDate(s.startedAt)}
                          {/* Mark the active session */}
                          {s.sessionId === sessionId && (
                            <span className="ml-2 text-[10px] text-emerald-600 font-medium">
                              active
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-gray-600 mt-0.5">
                          {s.messageCount} messages ·{" "}
                          {(s.totalInputTokens + s.totalOutputTokens).toLocaleString()} tokens ·{" "}
                          {formatCost(s.totalCostUsd)}
                        </p>
                        {s.contextMeta && (
                          <p className="text-[10px] text-gray-700 mt-0.5">
                            Context:{" "}
                            {new Date(s.contextMeta.builtAt).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                              timeZone: "Asia/Ho_Chi_Minh",
                            })}{" "}
                            · {s.contextMeta.sessionCount}s · {s.contextMeta.venueCount}v ·{" "}
                            {s.contextMeta.clubCount}c
                            {s.contextMeta.estimatedTokens > 0 && (
                              <> · ~{s.contextMeta.estimatedTokens.toLocaleString()} tokens</>
                            )}
                          </p>
                        )}
                      </div>
                      <span className="text-gray-700 text-[10px] ml-4">
                        {expandedSession === s.sessionId ? "Hide" : "View"}
                      </span>
                    </button>

                    {expandedSession === s.sessionId && (
                      <div className="mt-3 space-y-2 border-l-2 border-gray-800 pl-3">
                        {s.messages.map((m) => (
                          <div key={m.id}>
                            <p
                              className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${
                                m.role === "user" ? "text-emerald-600" : "text-blue-500"
                              }`}
                            >
                              {m.role}
                            </p>
                            <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">
                              {m.content}
                            </p>
                            {m.role === "assistant" && m.inputTokens != null && (
                              <p className="text-[10px] text-gray-700 mt-0.5">
                                {m.inputTokens} in · {m.outputTokens} out ·{" "}
                                {formatCost(m.estimatedCostUsd ?? 0)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete success toast */}
      {deleteToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-800 border border-gray-700 text-gray-200 text-xs font-medium px-4 py-2.5 rounded-lg shadow-xl">
          All conversations deleted
        </div>
      )}
    </div>
  );
}
