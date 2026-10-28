import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from app.tools.git_history.router import HistoryRequest, RewriteRequest, ReplaceRequest, history, rewrite, preview_replacement, replace_messages


class GitHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name)
        self.env = patch.dict(os.environ, {"GIT_REPOS_ROOT": str(self.repo)})
        self.env.start()
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.com")
        self.commit("initial")
        self.first = self.git("rev-parse", "HEAD")
        self.commit("AI signature\n\nCo-Authored-By: Robot")
        self.target = self.git("rev-parse", "HEAD")
        self.commit("last")
        self.head = self.git("rev-parse", "HEAD")

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.repo), *args], stderr=subprocess.DEVNULL).decode().strip()

    def commit(self, message):
        (self.repo / "file").write_text(message)
        self.git("add", ".")
        self.git("commit", "-m", message)

    def edit(self, **overrides):
        return rewrite(RewriteRequest(**{"path": str(self.repo), "commit": self.target, "expected_head": self.head, "message": "Mensaje limpio\n\nDetalle", "confirmed": True, **overrides}))

    def test_rewrite_preserves_tree_metadata_and_backup(self):
        tree = self.git("rev-parse", "HEAD^{tree}")
        metadata = self.git("show", "-s", "--format=%an %ae %aI %cn %ce %cI", self.target)
        result = self.edit()
        self.assertEqual(result["rewritten"], 2)
        self.assertEqual(self.git("rev-parse", "HEAD^{tree}"), tree)
        self.assertEqual(self.git("rev-parse", result["backup"]), self.head)
        self.assertEqual(self.git("show", "-s", "--format=%B", "HEAD^"), "Mensaje limpio\n\nDetalle")
        self.assertEqual(self.git("show", "-s", "--format=%an %ae %aI %cn %ce %cI", "HEAD^"), metadata)
        self.assertEqual(self.git("rev-parse", "HEAD^^"), self.first)
        self.assertEqual(self.git("status", "--porcelain"), "")

    def test_merges_and_other_branch_unchanged(self):
        self.git("checkout", "-b", "side", self.first)
        (self.repo / "other").write_text("side")
        self.git("add", ".")
        self.git("commit", "-m", "side")
        side = self.git("rev-parse", "HEAD")
        self.git("checkout", "main")
        self.git("merge", "--no-ff", "side", "-m", "merge")
        self.head = self.git("rev-parse", "HEAD")
        tree = self.git("rev-parse", "HEAD^{tree}")
        self.edit()
        self.assertEqual(self.git("rev-parse", "HEAD^2"), side)
        self.assertEqual(self.git("rev-parse", "side"), side)
        self.assertEqual(self.git("rev-parse", "HEAD^{tree}"), tree)

    def test_conflicts_dirty_and_unconfirmed(self):
        for values in [{"expected_head": self.first}, {"confirmed": False}]:
            with self.assertRaises(HTTPException):
                self.edit(**values)
        (self.repo / "untracked").write_text("x")
        with self.assertRaises(HTTPException):
            self.edit()
        self.assertEqual(self.git("rev-parse", "HEAD"), self.head)

    def test_search_and_branch(self):
        data = history(HistoryRequest(path=str(self.repo), query="co-authored-by", branch="main"))
        self.assertEqual([c["hash"] for c in data["commits"]], [self.target])

    def test_root_commit(self):
        self.edit(commit=self.first)
        self.assertEqual(self.git("rev-list", "--count", "HEAD"), "3")
        self.assertEqual(self.git("show", "-s", "--format=%B", "HEAD^^"), "Mensaje limpio\n\nDetalle")

    def replacement(self, **overrides):
        return ReplaceRequest(**{
            "path": str(self.repo), "expected_head": self.head, "expected_branch": "main",
            "find": "robot", "replacement": "Persona", "confirmed": True, **overrides,
        })

    def test_bulk_preview_is_read_only_and_replacement_preserves_content(self):
        self.commit("ROBOT Robot\n\nDetail robot and unrelated text")
        self.head = self.git("rev-parse", "HEAD")
        before = self.git("log", "--format=%T %an %ae %aI %cn %ce %cI")
        plan = preview_replacement(self.replacement())
        self.assertEqual(plan["matched"], 2)
        self.assertEqual(plan["occurrences"], 4)
        self.assertEqual(self.git("rev-parse", "HEAD"), self.head)
        self.assertEqual(self.git("for-each-ref", "refs/tools-hub/backups"), "")
        self.assertIn("Detail Persona and unrelated text", plan["commits"][1]["after"])
        result = replace_messages(self.replacement())
        self.assertEqual(result["changed"], 2)
        self.assertEqual(result["occurrences"], 4)
        self.assertEqual(result["rewritten"], 3)
        self.assertEqual(self.git("rev-parse", result["backup"]), self.head)
        self.assertEqual(self.git("log", "--format=%T %an %ae %aI %cn %ce %cI"), before)
        self.assertEqual(self.git("show", "-s", "--format=%B", "HEAD"), "Persona Persona\n\nDetail Persona and unrelated text")
        self.assertEqual(self.git("status", "--porcelain"), "")

    def test_literal_case_sensitive_and_deletion(self):
        self.commit("A.* Robot robot\n\nA.* remains")
        self.head = self.git("rev-parse", "HEAD")
        literal = preview_replacement(self.replacement(find="A.*", replacement=r"\1 $value"))
        self.assertEqual(literal["occurrences"], 2)
        self.assertIn(r"\1 $value Robot robot", literal["commits"][0]["after"])
        sensitive = preview_replacement(self.replacement(case_sensitive=True))
        self.assertEqual(sensitive["occurrences"], 1)
        deleted = replace_messages(self.replacement(find="Co-Authored-By: Robot", replacement=""))
        self.assertEqual(deleted["changed"], 1)
        self.assertEqual(self.git("show", "-s", "--format=%B", "HEAD^^"), "AI signature")

    def test_bulk_rejects_stale_unconfirmed_empty_or_missing_changes(self):
        for values in [
            {"confirmed": False}, {"expected_head": self.first}, {"expected_branch": "other"},
            {"find": "initial", "replacement": ""}, {"find": "missing text"},
            {"find": "Robot", "replacement": "Robot"}, {"replacement": "\0"},
        ]:
            with self.subTest(values=values), self.assertRaises(HTTPException):
                replace_messages(self.replacement(**values))
        self.git("branch", "other")
        self.git("checkout", "other")
        with self.assertRaises(HTTPException):
            replace_messages(self.replacement())
        self.git("checkout", "main")
        (self.repo / "file").write_text("dirty")
        with self.assertRaises(HTTPException):
            replace_messages(self.replacement())
        self.assertEqual(self.git("rev-parse", "HEAD"), self.head)
        self.assertEqual(self.git("for-each-ref", "refs/tools-hub/backups"), "")

    def test_bulk_replacement_includes_commits_outside_first_page(self):
        tree = self.git("rev-parse", "HEAD^{tree}")
        for index in range(102):
            self.head = self.git("commit-tree", tree, "-p", self.head, "-m", f"later {index}")
        self.git("update-ref", "refs/heads/main", self.head)
        page = history(HistoryRequest(path=str(self.repo)))
        self.assertNotIn(self.target, [item["hash"] for item in page["commits"]])
        result = replace_messages(self.replacement())
        self.assertEqual(result["changed"], 1)
        self.assertEqual(result["rewritten"], 104)
        self.assertIn("Co-Authored-By: Persona", self.git("log", "--format=%B"))
        self.assertEqual(self.git("rev-list", "--count", "HEAD"), "105")

    def test_bulk_preserves_merges_and_other_branch_refs(self):
        self.git("checkout", "-b", "side", self.first)
        (self.repo / "other").write_text("side")
        self.git("add", ".")
        self.git("commit", "-m", "Robot on side")
        side = self.git("rev-parse", "HEAD")
        self.git("checkout", "main")
        self.git("merge", "--no-ff", "side", "-m", "merge Robot")
        self.head = self.git("rev-parse", "HEAD")
        tree = self.git("rev-parse", "HEAD^{tree}")
        result = replace_messages(self.replacement())
        self.assertEqual(result["changed"], 3)
        self.assertEqual(self.git("rev-parse", "side"), side)
        self.assertNotEqual(self.git("rev-parse", "HEAD^2"), side)
        self.assertEqual(self.git("show", "-s", "--format=%B", "HEAD^2"), "Persona on side")
        self.assertEqual(self.git("rev-parse", "HEAD^{tree}"), tree)

    def test_replacement_uses_utf8_and_preserves_message_whitespace(self):
        raw = subprocess.check_output(["git", "-C", str(self.repo), "cat-file", "commit", self.head])
        headers, _ = raw.split(b"\n\n", 1)
        content = headers + b"\nencoding ISO-8859-1\n\nRobot\n\n  detail  \n\n"
        oid = subprocess.check_output(["git", "-C", str(self.repo), "hash-object", "-t", "commit", "-w", "--stdin"], input=content).decode().strip()
        self.git("update-ref", "refs/heads/main", oid)
        self.head = oid
        replace_messages(self.replacement(replacement="Compañero"))
        rewritten = subprocess.check_output(["git", "-C", str(self.repo), "cat-file", "commit", "HEAD"])
        headers, message = rewritten.split(b"\n\n", 1)
        self.assertNotIn(b"encoding ", headers)
        self.assertEqual(message.decode(), "Compañero\n\n  detail  \n\n")


if __name__ == "__main__":
    unittest.main()
