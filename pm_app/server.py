from __future__ import annotations

import argparse
import json
import mimetypes
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .store import Principal, Store


ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "pm_app" / "static"
DEFAULT_DB = ROOT / "pm_phase1.sqlite3"


class App:
    def __init__(self, store: Store):
        self.store = store

    def principal(self, headers) -> Principal:
        fallback = self.store.default_principal()
        return Principal(
            user_id=headers.get("X-User-Id", fallback.user_id),
            workspace_id=headers.get("X-Workspace-Id", fallback.workspace_id),
        )

    def handle(self, method: str, raw_path: str, headers, body: bytes) -> tuple[int, dict[str, str], bytes]:
        parsed = urlparse(raw_path)
        path = parsed.path
        query = {key: values[-1] for key, values in parse_qs(parsed.query).items()}

        if path == "/" and method == "GET":
            return self.static_file("index.html")
        if path.startswith("/static/") and method == "GET":
            return self.static_file(path.removeprefix("/static/"))
        if path == "/api/health" and method == "GET":
            return self.json({"status": "ok"})

        if not path.startswith("/api/"):
            return self.error(HTTPStatus.NOT_FOUND, "Not found")

        principal = self.principal(headers)
        payload = self.read_json(body)
        parts = [part for part in path.split("/") if part][1:]

        try:
            if parts == ["session"] and method == "GET":
                return self.json(self.store.session(principal))
            if parts == ["projects"] and method == "GET":
                return self.json({"projects": self.store.list_projects(principal)})
            if parts == ["projects"] and method == "POST":
                return self.json(self.store.create_project(principal, payload), HTTPStatus.CREATED)
            if parts == ["tasks"] and method == "GET":
                return self.json({"tasks": self.store.list_tasks(principal, query)})
            if parts == ["tasks"] and method == "POST":
                return self.json(self.store.create_task(principal, payload), HTTPStatus.CREATED)
            if len(parts) == 2 and parts[0] == "tasks" and method == "GET":
                return self.json(self.store.get_task_by_id(principal, parts[1]))
            if len(parts) == 2 and parts[0] == "tasks" and method == "PATCH":
                return self.json(self.store.update_task(principal, parts[1], payload))
            if len(parts) == 3 and parts[0] == "tasks" and parts[2] == "comments" and method == "POST":
                return self.json(self.store.add_comment(principal, parts[1], payload), HTTPStatus.CREATED)
            if len(parts) == 3 and parts[0] == "tasks" and parts[2] == "attachments" and method == "POST":
                return self.json(self.store.add_attachment(principal, parts[1], payload), HTTPStatus.CREATED)
            if parts == ["search"] and method == "GET":
                return self.json(self.store.search(principal, query.get("q", "")))
            if parts == ["notifications"] and method == "GET":
                return self.json({"notifications": self.store.list_notifications(principal)})
            if len(parts) == 2 and parts[0] == "notifications" and method == "PATCH":
                return self.json(self.store.mark_notification(principal, parts[1], bool(payload.get("is_read"))))
            if parts == ["billing", "account"] and method == "GET":
                return self.json(self.store.billing_account(principal))
            if parts == ["billing", "checkout-intent"] and method == "POST":
                return self.json(self.store.checkout_intent(principal, payload), HTTPStatus.CREATED)
        except ValueError as exc:
            return self.error(HTTPStatus.BAD_REQUEST, str(exc))
        except LookupError as exc:
            return self.error(HTTPStatus.NOT_FOUND, str(exc))

        return self.error(HTTPStatus.NOT_FOUND, "Route not found")

    def static_file(self, relative_path: str) -> tuple[int, dict[str, str], bytes]:
        target = (STATIC_DIR / relative_path).resolve()
        if not str(target).startswith(str(STATIC_DIR.resolve())) or not target.is_file():
            return self.error(HTTPStatus.NOT_FOUND, "Static file not found")
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        return HTTPStatus.OK, {"Content-Type": content_type}, target.read_bytes()

    @staticmethod
    def read_json(body: bytes) -> dict:
        if not body:
            return {}
        return json.loads(body.decode("utf-8"))

    @staticmethod
    def json(payload: object, status: HTTPStatus = HTTPStatus.OK) -> tuple[int, dict[str, str], bytes]:
        return (
            int(status),
            {"Content-Type": "application/json"},
            json.dumps(payload, indent=2, sort_keys=True).encode("utf-8"),
        )

    @staticmethod
    def error(status: HTTPStatus, message: str) -> tuple[int, dict[str, str], bytes]:
        return App.json({"error": message}, status)


def make_handler(app: App):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            self.respond()

        def do_POST(self) -> None:
            self.respond()

        def do_PATCH(self) -> None:
            self.respond()

        def respond(self) -> None:
            length = int(self.headers.get("Content-Length") or "0")
            body = self.rfile.read(length) if length else b""
            status, headers, response = app.handle(self.command, self.path, self.headers, body)
            self.send_response(status)
            for key, value in headers.items():
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)

        def log_message(self, format: str, *args) -> None:
            if os.environ.get("PM_ACCESS_LOG"):
                super().log_message(format, *args)

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Phase 1 task product server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--db", default=str(DEFAULT_DB))
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), make_handler(App(Store(args.db))))
    print(f"Phase 1 task product running at http://{args.host}:{args.port}")
    print(f"SQLite database: {args.db}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down")


if __name__ == "__main__":
    main()

