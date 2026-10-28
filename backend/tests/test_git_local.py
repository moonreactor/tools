import subprocess
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from app.git_local import pick_folder


class NativeFolderPickerTests(unittest.TestCase):
    @patch("app.git_local.sys.platform", "darwin")
    @patch("app.git_local.subprocess.run")
    def test_selected_host_path(self, run):
        run.return_value = subprocess.CompletedProcess([], 0, "/Users/test/My repositories/repo/\n", "")
        self.assertEqual(pick_folder()["path"], "/Users/test/My repositories/repo/")
        self.assertEqual(run.call_args.args[0][0], "osascript")

    @patch("app.git_local.sys.platform", "darwin")
    @patch("app.git_local.subprocess.run")
    def test_cancel_is_not_an_error(self, run):
        run.return_value = subprocess.CompletedProcess([], 1, "", "User canceled. (-128)")
        self.assertIsNone(pick_folder()["path"])

    @patch("app.git_local.sys.platform", "darwin")
    @patch("app.git_local.subprocess.run")
    def test_picker_failure(self, run):
        run.return_value = subprocess.CompletedProcess([], 1, "", "error")
        with self.assertRaises(HTTPException):
            pick_folder()

    @patch("app.git_local.sys.platform", "darwin")
    @patch("app.git_local.subprocess.run", side_effect=subprocess.TimeoutExpired("osascript", 300))
    def test_timeout(self, run):
        with self.assertRaises(HTTPException) as error:
            pick_folder()
        self.assertEqual(error.exception.status_code, 408)
