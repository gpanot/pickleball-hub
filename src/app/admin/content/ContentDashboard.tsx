"use client";

import { useState, useTransition, useCallback, useEffect } from "react";

type Post = {
  id: string;
  postType: string;
  channel: string;
  generatedText: string;
  status: string;
  scheduledDate: string;
  postedAt: string | null;
  postNow: boolean;
  error: string | null;
  createdAt: string;
};

const POST_TYPE_LABELS: Record<string, string> = {
  competitive_tonight: "Competitive Tonight",
  club_spotlight: "Club Spotlight",
  heatmap_weekly: "Heatmap Weekly",
};

const CHANNEL_COLORS: Record<string, string> = {
  zalo_oa: "bg-blue-900/60 text-blue-300 border-blue-800",
  facebook: "bg-indigo-900/60 text-indigo-300 border-indigo-800",
};

const STATUS_COLORS: Record<string, string> = {
  pending:  "bg-yellow-900/50 text-yellow-300 border-yellow-800",
  approved: "bg-emerald-900/50 text-emerald-300 border-emerald-800",
  posted:   "bg-gray-800 text-gray-400 border-gray-700",
  skipped:  "bg-gray-800 text-gray-500 border-gray-700",
  error:    "bg-red-900/50 text-red-300 border-red-800",
};

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`}>
      {label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function PostCard({
  post,
  onUpdate,
  onDelete,
  onRegenerate,
  isRegenerating,
}: {
  post: Post;
  onUpdate: (id: string, changes: Partial<Post>) => void;
  onDelete: (id: string) => void;
  onRegenerate: (postType: string, deleteId: string) => void;
  isRegenerating: boolean;
}) {
  const [text, setText] = useState(post.generatedText);
  const [isPending, startTransition] = useTransition();
  const [actionLabel, setActionLabel] = useState<string | null>(null);

  async function patch(changes: Record<string, unknown>) {
    const res = await fetch(`/api/admin/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (!res.ok) throw new Error("Failed to update post");
    return (await res.json() as { post: Post }).post;
  }

  function handleAction(label: string, fn: () => Promise<Post>) {
    setActionLabel(label);
    startTransition(async () => {
      try {
        const updated = await fn();
        onUpdate(post.id, updated);
      } catch (err) {
        console.error(err);
      } finally {
        setActionLabel(null);
      }
    });
  }

  async function handleDelete() {
    await fetch(`/api/admin/posts/${post.id}`, { method: "DELETE" });
    onDelete(post.id);
  }

  const busy = isPending || isRegenerating;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          label={POST_TYPE_LABELS[post.postType] ?? post.postType}
          colorClass="bg-gray-800 text-gray-300 border-gray-700"
        />
        <Badge
          label={post.channel === "zalo_oa" ? "Zalo OA" : "Facebook"}
          colorClass={CHANNEL_COLORS[post.channel] ?? "bg-gray-800 text-gray-300 border-gray-700"}
        />
        <Badge
          label={post.status}
          colorClass={STATUS_COLORS[post.status] ?? "bg-gray-800 text-gray-300 border-gray-700"}
        />
        <span className="ml-auto text-xs text-gray-500">{formatDate(post.scheduledDate)}</span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition font-mono"
      />

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{text.length} chars</span>
        {text.length > 300 && <span className="text-amber-400">Over 300 — Zalo may truncate</span>}
      </div>

      {post.error && (
        <div className="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded px-2 py-1.5 font-mono">
          {post.error}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          disabled={busy}
          onClick={() => handleAction("Skipping", () => patch({ status: "skipped" }))}
          className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition disabled:opacity-50"
        >
          {actionLabel === "Skipping" ? "…" : "Skip"}
        </button>
        <button
          disabled={busy}
          onClick={handleDelete}
          className="px-3 py-1.5 text-xs rounded-lg border border-red-900/60 text-red-400 hover:bg-red-950/30 transition disabled:opacity-50"
        >
          Delete
        </button>
        <button
          disabled={busy}
          onClick={() => onRegenerate(post.postType, post.id)}
          className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition disabled:opacity-50 flex items-center gap-1.5"
        >
          {isRegenerating ? <><Spinner /> Regenerating…</> : "Regenerate"}
        </button>
        <button
          disabled={busy}
          onClick={() => handleAction("Saving", () => patch({ status: "approved", generatedText: text }))}
          className="px-3 py-1.5 text-xs rounded-lg border border-emerald-800 text-emerald-400 hover:bg-emerald-900/40 transition disabled:opacity-50"
        >
          {actionLabel === "Saving" ? "…" : "Approve"}
        </button>
        <button
          disabled={busy}
          onClick={() => handleAction("Posting", () => patch({ status: "approved", generatedText: text, postNow: true }))}
          className="px-3 py-1.5 text-xs rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition disabled:opacity-50"
        >
          {actionLabel === "Posting" ? "Queuing…" : "Post Now"}
        </button>
      </div>
    </div>
  );
}

type ToastState = { message: string; type: "success" | "error" } | null;

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onDismiss, 4000);
    return () => clearTimeout(id);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const isSuccess = toast.type === "success";
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium transition-all ${
        isSuccess
          ? "bg-emerald-950 border-emerald-700 text-emerald-300"
          : "bg-red-950 border-red-700 text-red-300"
      }`}
    >
      <span
        className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold ${
          isSuccess ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}
      >
        {isSuccess ? "✓" : "✕"}
      </span>
      {toast.message}
      <button
        onClick={onDismiss}
        className="ml-2 text-current opacity-50 hover:opacity-100 transition"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

function CacheManagement() {
  const [clearing, setClearing] = useState<string | null>(null);
  const [lastCleared, setLastCleared] = useState<Date | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  async function clearTag(tag: string) {
    const res = await fetch("/api/admin/cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    const data = await res.json() as { success?: boolean; error?: string };
    if (!res.ok || !data.success) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
  }

  async function handleClear(tags: string[]) {
    const key = tags.join("+");
    setClearing(key);
    try {
      for (const tag of tags) {
        await clearTag(tag);
      }
      setLastCleared(new Date());
      setToast({ message: "Cache cleared successfully", type: "success" });
    } catch (e) {
      setToast({ message: String(e), type: "error" });
    } finally {
      setClearing(null);
    }
  }

  function lastClearedLabel() {
    if (!lastCleared) return "never";
    const secs = Math.floor((Date.now() - lastCleared.getTime()) / 1000);
    if (secs < 60) return `${secs} second${secs !== 1 ? "s" : ""} ago`;
    const mins = Math.floor(secs / 60);
    return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  }

  const buttons: { label: string; tags: string[]; key: string }[] = [
    { label: "Clear Heatmap Cache",       tags: ["heatmap"],           key: "heatmap" },
    { label: "Clear DUPR Cache",           tags: ["dupr-distribution"], key: "dupr-distribution" },
    { label: "Clear All",                  tags: ["heatmap", "dupr-distribution"], key: "heatmap+dupr-distribution" },
  ];

  return (
    <>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Cache Management
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {buttons.map(({ label, tags, key }) => {
              const isActive = clearing === key;
              const isBusy = clearing !== null;
              const isAll = key === "heatmap+dupr-distribution";
              return (
                <button
                  key={key}
                  disabled={isBusy}
                  onClick={() => handleClear(tags)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-lg border transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    isAll
                      ? "border-orange-800 text-orange-400 hover:bg-orange-950/40"
                      : "border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white"
                  }`}
                >
                  {isActive ? <><Spinner /> Clearing…</> : label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500">
            Last cleared: <span className="text-gray-400">{lastClearedLabel()}</span>
          </p>
        </div>
      </section>
    </>
  );
}

function HistoryRow({ post }: { post: Post }) {
  const label = post.postedAt ? formatDate(post.postedAt) : formatDate(post.createdAt);
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-800 last:border-0">
      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
        <Badge
          label={post.channel === "zalo_oa" ? "Zalo" : "FB"}
          colorClass={CHANNEL_COLORS[post.channel] ?? "bg-gray-800 text-gray-300 border-gray-700"}
        />
        <Badge
          label={post.status}
          colorClass={STATUS_COLORS[post.status] ?? "bg-gray-800 text-gray-300 border-gray-700"}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 mb-0.5">
          {POST_TYPE_LABELS[post.postType] ?? post.postType} · {label}
        </p>
        <p className="text-sm text-gray-300 truncate">{post.generatedText.slice(0, 120)}</p>
        {post.error && <p className="text-xs text-red-400 mt-0.5 truncate">{post.error}</p>}
      </div>
    </div>
  );
}

export function ContentDashboard({
  initialPending,
  initialHistory,
  monthSpend,
  budget,
  budgetPct,
}: {
  initialPending: Post[];
  initialHistory: Post[];
  monthSpend: number;
  budget: number;
  budgetPct: number;
}) {
  const [pendingPosts, setPendingPosts] = useState<Post[]>(initialPending);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isGenerating, startGenerating] = useTransition();
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null);
  const [regeneratingType, setRegeneratingType] = useState<string | null>(null);

  const pendingCount  = pendingPosts.filter((p) => p.status === "pending").length;
  const approvedCount = pendingPosts.filter((p) => p.status === "approved").length;
  const budgetBlocked = budgetPct >= 1;
  const budgetWarn    = budgetPct >= 0.8 && !budgetBlocked;

  function handleUpdate(id: string, changes: Partial<Post>) {
    setPendingPosts((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx === -1) return prev;
      const updated = { ...prev[idx], ...changes } as Post;
      if (!["pending", "approved"].includes(updated.status)) {
        return prev.filter((p) => p.id !== id);
      }
      return prev.map((p) => (p.id === id ? updated : p));
    });
  }

  function handleDelete(id: string) {
    setPendingPosts((prev) => prev.filter((p) => p.id !== id));
  }

  const fetchPending = useCallback(async () => {
    const res = await fetch("/api/admin/posts?status=pending&limit=50");
    if (!res.ok) return;
    const data = await res.json() as { posts: Post[] };
    setPendingPosts(data.posts);
  }, []);

  function handleGenerate(postType?: string) {
    setGenerateError(null);
    startGenerating(async () => {
      try {
        const res = await fetch("/api/admin/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(postType ? { postType } : {}),
        });
        let data: { ok?: boolean; error?: string; postsCreated?: number } = {};
        try {
          data = await res.json();
        } catch {
          setGenerateError(`Server returned HTTP ${res.status} with no JSON body — check server logs`);
          return;
        }
        if (!res.ok || !data.ok) {
          setGenerateError(data.error ?? `HTTP ${res.status}`);
          return;
        }
        setLastGenerated(new Date());
        await fetchPending();
      } catch (e) {
        setGenerateError(String(e));
      }
    });
  }

  async function handleRegenerate(postType: string, deleteId: string) {
    setRegeneratingType(postType);
    setGenerateError(null);
    try {
      await fetch(`/api/admin/posts/${deleteId}`, { method: "DELETE" });
      setPendingPosts((prev) => prev.filter((p) => p.id !== deleteId));

      const res = await fetch("/api/admin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postType }),
      });
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        setGenerateError(`Server returned HTTP ${res.status} with no JSON body — check server logs`);
        return;
      }
      if (!res.ok || !data.ok) {
        setGenerateError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setLastGenerated(new Date());
      await fetchPending();
    } catch (e) {
      setGenerateError(String(e));
    } finally {
      setRegeneratingType(null);
    }
  }

  function lastGeneratedLabel() {
    if (!lastGenerated) return null;
    const mins = Math.round((Date.now() - lastGenerated.getTime()) / 60000);
    return mins < 1 ? "just now" : `${mins}m ago`;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Budget warning banners */}
      {budgetBlocked && (
        <div className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <span className="font-semibold">Monthly budget reached.</span>{" "}
          ${monthSpend.toFixed(4)} / ${budget.toFixed(2)} used. New content generation is blocked.{" "}
          <a href="/admin/settings" className="underline hover:text-red-200">Update budget in Settings</a> or wait until next month.
        </div>
      )}
      {budgetWarn && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          You have used <span className="font-semibold">{Math.round(budgetPct * 100)}%</span> of your monthly LLM budget (${monthSpend.toFixed(4)} / ${budget.toFixed(2)}) — consider{" "}
          <a href="/admin/settings" className="underline hover:text-amber-200">switching to Haiku</a>.
        </div>
      )}

      {/* Page title row with Generate Now */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Content Queue</h1>
          <p className="text-xs text-gray-500 mt-0.5">Social posts · Pickleball Hub</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <span className="text-yellow-400 bg-yellow-900/30 border border-yellow-800 rounded-full px-2.5 py-0.5 text-xs">
                {pendingCount} pending
              </span>
            )}
            {approvedCount > 0 && (
              <span className="text-emerald-400 bg-emerald-900/30 border border-emerald-800 rounded-full px-2.5 py-0.5 text-xs">
                {approvedCount} approved
              </span>
            )}
            <button
              disabled={isGenerating || budgetBlocked}
              onClick={() => handleGenerate()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? <><Spinner /> Generating…</> : "Generate Now"}
            </button>
          </div>
          {lastGeneratedLabel() && (
            <span className="text-xs text-gray-600">Last generated: {lastGeneratedLabel()}</span>
          )}
          {generateError && (
            <p className="text-xs text-red-400 max-w-xs text-right">{generateError}</p>
          )}
        </div>
      </div>

      {/* Pending queue */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Pending Queue
        </h2>
        {pendingPosts.length === 0 ? (
          <div className="text-center py-12 text-gray-600 text-sm">
            No pending posts. Click "Generate Now" or wait for the 6 AM / 3 PM cron.
          </div>
        ) : (
          <div className="space-y-4">
            {pendingPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onRegenerate={handleRegenerate}
                isRegenerating={regeneratingType === post.postType}
              />
            ))}
          </div>
        )}
      </section>

      {/* Cache management */}
      <CacheManagement />

      {/* Posted history */}
      <section>
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 hover:text-white transition"
        >
          <svg
            className={`w-4 h-4 transition-transform ${historyOpen ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Posted History — last 14 days ({initialHistory.length})
        </button>
        {historyOpen && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-4">
            {initialHistory.length === 0 ? (
              <p className="text-sm text-gray-600 py-6 text-center">No posts in the last 14 days.</p>
            ) : (
              initialHistory.map((post) => <HistoryRow key={post.id} post={post} />)
            )}
          </div>
        )}
      </section>
    </div>
  );
}
