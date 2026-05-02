import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin Login" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const hasError = params.error === "1";
  const next = params.next ?? "/admin/content";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-white tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-gray-400">Pickleball Hub content panel</p>
        </div>

        <form
          method="POST"
          action="/api/admin/login"
          className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-5"
        >
          <input type="hidden" name="next" value={next} />

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              placeholder="Enter admin password"
            />
          </div>

          {hasError && (
            <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">
              Incorrect password. Try again.
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-lg px-4 py-2.5 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
