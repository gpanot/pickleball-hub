"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}

interface ConversationSession {
  sessionId: string;
  startedAt: string;
  messageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
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

export function AiAssistantClient() {
  // Initialize with empty string to match SSR output, then set a real UUID after mount
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [logsOpen, setLogsOpen] = useState(false);
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setSessionId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setSessionId(crypto.randomUUID());
    setError(null);
    inputRef.current?.focus();
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch("/api/admin/ai-assistant/logs");
      const data = await res.json();
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

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

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

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Unknown error");
        return;
      }

      const assistantMsg: Message = {
        role: "assistant",
        content: data.content,
        inputTokens: data.usage?.inputTokens,
        outputTokens: data.usage?.outputTokens,
        estimatedCostUsd: data.usage?.estimatedCostUsd,
      };
      setMessages((prev) => [...prev, assistantMsg]);
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
          onClick={clearConversation}
          className="text-xs text-gray-500 hover:text-gray-300 transition px-3 py-1.5 rounded border border-gray-700 hover:border-gray-500"
        >
          Clear conversation
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
              Internal testing only · Powered by Claude Sonnet
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
      </div>

      {/* Recent conversations section */}
      <div className="shrink-0 border-t border-gray-800">
        <button
          onClick={toggleLogs}
          className="w-full flex items-center justify-between px-6 py-3 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-900 transition"
        >
          <span className="font-medium tracking-wide uppercase">Recent conversations</span>
          <span className="text-gray-600">{logsOpen ? "▲" : "▼"}</span>
        </button>

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
                        </p>
                        <p className="text-[10px] text-gray-600 mt-0.5">
                          {s.messageCount} messages ·{" "}
                          {(s.totalInputTokens + s.totalOutputTokens).toLocaleString()} tokens ·{" "}
                          {formatCost(s.totalCostUsd)}
                        </p>
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
    </div>
  );
}
