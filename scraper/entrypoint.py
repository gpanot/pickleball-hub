#!/usr/bin/env python3
"""
Container entrypoint for the Railway scraper service.

Replaces run.sh to avoid shell-script execution issues on Linux containers
(shebang/CRLF/missing-interpreter errors that caused repeated crashes).

Two modes:
  - Cron (default): runs scrape immediately, then exits (Railway cron).
  - HTTP (--serve only): optional tiny server; POST /run runs a scrape.
    Use a separate Web service on Railway with start command
    `python entrypoint.py --serve` — do not use with cron + PORT or the
    job will never finish.

Logic per scrape:
  - Mon/Wed (Vietnam time): scan_clubs.py then ingest.py
  - Other days: ingest.py only
"""

import os
import subprocess
import sys
import json
import threading
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler

VN_TZ = timezone(timedelta(hours=7))
SCRAPER_SECRET = os.environ.get("SCRAPER_SECRET", "")

_running_lock = threading.Lock()
_is_running = False


def run_cmd(cmd: list[str]) -> int:
    print(f"  >> {' '.join(cmd)}", flush=True)
    result = subprocess.run(cmd)
    return result.returncode


def trigger_vercel_revalidation() -> None:
    """Best-effort Next.js cache revalidation; never raises."""
    base = (os.environ.get("VERCEL_APP_URL") or "").strip().rstrip("/")
    token = os.environ.get("REVALIDATE_SECRET", "")
    if not base or not token:
        return
    url = f"{base}/api/revalidate"
    try:
        req = urllib.request.Request(
            url,
            data=b"",
            method="POST",
            headers={"x-revalidate-token": token},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                print("  [revalidate] Vercel cache revalidated successfully", flush=True)
            else:
                print(f"  [revalidate] unexpected status: {resp.status}", flush=True)
    except urllib.error.HTTPError as e:
        print(f"  [revalidate] failed: HTTP {e.code}", flush=True)
    except Exception as e:
        print(f"  [revalidate] request error: {e}", flush=True)


def run_scrape() -> dict:
    global _is_running
    with _running_lock:
        if _is_running:
            return {"ok": False, "error": "Scrape already in progress"}
        _is_running = True

    try:
        now = datetime.now(VN_TZ)
        dow = now.isoweekday()
        print(f"\n=== Pickleball Hub Scrape — {now.strftime('%A %Y-%m-%d %H:%M')} VN ===", flush=True)

        scan_rc = None
        if dow in (1, 3):
            print("\n=== STEP 1/2: Refreshing club info (Mon/Wed) ===", flush=True)
            scan_rc = run_cmd([sys.executable, "scan_clubs.py", "--workers", "15"])
            if scan_rc != 0:
                print(f"  scan_clubs exited {scan_rc}, continuing with ingest...", flush=True)
        else:
            print("\n=== STEP 1/2: Skipping club refresh (only runs Mon & Wed) ===", flush=True)

        print("\n=== STEP 2/2: Ingest today + tomorrow events ===", flush=True)
        ingest_rc = run_cmd([sys.executable, "ingest.py"])

        if ingest_rc == 0:
            trigger_vercel_revalidation()

        print("\n=== Done ===", flush=True)
        return {
            "ok": ingest_rc == 0,
            "scan_clubs_rc": scan_rc,
            "ingest_rc": ingest_rc,
            "timestamp": datetime.now(VN_TZ).isoformat(),
        }
    finally:
        with _running_lock:
            _is_running = False


class Handler(BaseHTTPRequestHandler):
    def _check_auth(self) -> bool:
        if not SCRAPER_SECRET:
            return True
        auth = self.headers.get("Authorization", "")
        if auth == f"Bearer {SCRAPER_SECRET}":
            return True
        self._json_response(401, {"error": "Unauthorized"})
        return False

    def _json_response(self, code: int, body: dict):
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/health":
            with _running_lock:
                running = _is_running
            self._json_response(200, {"status": "ok", "scraping": running})
        else:
            self._json_response(200, {
                "service": "pickleball-hub-scraper",
                "endpoints": {"POST /run": "trigger scrape", "GET /health": "health check"},
            })

    def do_POST(self):
        if self.path == "/run":
            if not self._check_auth():
                return
            result = run_scrape()
            code = 200 if result.get("ok") else 500
            if result.get("error") == "Scrape already in progress":
                code = 409
            self._json_response(code, result)
        else:
            self._json_response(404, {"error": "Not found"})

    def log_message(self, fmt, *args):
        print(f"  [http] {fmt % args}", flush=True)


def main():
    mode = "serve" if "--serve" in sys.argv else "cron"

    if mode == "serve":
        port = int(os.environ.get("PORT", "8080"))
        print(f"=== Scraper HTTP server on :{port} ===", flush=True)
        print(f"  POST /run   — trigger a scrape", flush=True)
        print(f"  GET /health — health check", flush=True)
        if SCRAPER_SECRET:
            print(f"  Auth: Bearer token required", flush=True)
        else:
            print(f"  Auth: none (set SCRAPER_SECRET to require)", flush=True)
        server = HTTPServer(("0.0.0.0", port), Handler)
        server.serve_forever()
    else:
        result = run_scrape()
        if not result.get("ok"):
            sys.exit(1)


if __name__ == "__main__":
    main()
