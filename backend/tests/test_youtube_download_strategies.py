import unittest

from app.tools.youtube_downloader.router import (
    DOWNLOAD_STRATEGIES,
    _build_yt_dlp_args,
    _should_retry_download,
)


class YoutubeDownloadStrategyTests(unittest.TestCase):
    def test_first_strategy_keeps_the_default_player_client(self):
        use_cookies, extractor_args = DOWNLOAD_STRATEGIES[0]
        self.assertFalse(use_cookies)
        self.assertIsNone(extractor_args)

    def test_default_client_omits_extractor_args(self):
        args = _build_yt_dlp_args(
            "/tmp",
            ["--skip-download", "https://www.youtube.com/watch?v=DIvewN35QT4"],
            use_cookies=False,
            extractor_args=None,
        )
        self.assertNotIn("--extractor-args", args)
        self.assertIn("--js-runtimes", args)

    def test_explicit_client_is_passed_through(self):
        args = _build_yt_dlp_args(
            "/tmp",
            ["--skip-download"],
            use_cookies=False,
            extractor_args="youtube:player_client=android,mweb;player_js_version=actual",
        )
        self.assertIn(
            "youtube:player_client=android,mweb;player_js_version=actual",
            args,
        )

    def test_unavailable_from_one_client_is_retried(self):
        detail = "yt-dlp failed: ERROR: [youtube] DIvewN35QT4: Video unavailable"
        self.assertTrue(_should_retry_download(detail))
