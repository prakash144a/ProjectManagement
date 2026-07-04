import json
import tempfile
import unittest
from pathlib import Path

from pm_app.server import App
from pm_app.store import Store


class PhaseOneStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmpdir.name) / "test.sqlite3")
        self.principal = self.store.default_principal()

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_seeded_workspace_has_core_phase_one_data(self):
        session = self.store.session(self.principal)
        projects = self.store.list_projects(self.principal)
        tasks = self.store.list_tasks(self.principal, {})
        billing = self.store.billing_account(self.principal)

        self.assertEqual(session["workspace"]["name"], "Product Workspace")
        self.assertGreaterEqual(len(session["members"]), 2)
        self.assertEqual(len(projects), 1)
        self.assertEqual(len(tasks), 3)
        self.assertEqual(billing["plan"], "trial")

    def test_create_update_comment_and_search_task(self):
        project = self.store.list_projects(self.principal)[0]
        task = self.store.create_task(
            self.principal,
            {
                "project_id": project["id"],
                "title": "Review onboarding checklist",
                "priority": "high",
            },
        )
        updated = self.store.update_task(self.principal, task["id"], {"status": "in_progress"})
        comment = self.store.add_comment(self.principal, task["id"], {"body": "First pass complete."})
        results = self.store.search(self.principal, "onboarding")

        self.assertEqual(updated["status"], "in_progress")
        self.assertEqual(comment["body"], "First pass complete.")
        self.assertEqual(results["tasks"][0]["id"], task["id"])


class PhaseOneApiTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.app = App(Store(Path(self.tmpdir.name) / "test.sqlite3"))

    def tearDown(self):
        self.tmpdir.cleanup()

    def request(self, method, path, payload=None):
        body = json.dumps(payload or {}).encode("utf-8") if payload is not None else b""
        status, _headers, response = self.app.handle(method, path, {}, body)
        return status, json.loads(response.decode("utf-8"))

    def test_tasks_endpoint_creates_and_lists_tasks(self):
        status, created = self.request("POST", "/api/tasks", {"title": "API-created task"})
        self.assertEqual(status, 201)
        self.assertEqual(created["title"], "API-created task")

        status, listed = self.request("GET", "/api/tasks?q=API-created")
        self.assertEqual(status, 200)
        self.assertEqual(listed["tasks"][0]["id"], created["id"])

    def test_validation_errors_are_reported(self):
        status, payload = self.request("POST", "/api/tasks", {"title": ""})
        self.assertEqual(status, 400)
        self.assertIn("title is required", payload["error"])

    def test_billing_checkout_intent_is_available(self):
        status, intent = self.request("POST", "/api/billing/checkout-intent", {"plan": "team", "seats": 4})
        self.assertEqual(status, 201)
        self.assertEqual(intent["provider"], "mock")
        self.assertEqual(intent["seats"], 4)


if __name__ == "__main__":
    unittest.main()

