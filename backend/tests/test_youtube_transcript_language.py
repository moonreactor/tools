import unittest
from unittest.mock import MagicMock

from youtube_transcript_api import NoTranscriptFound

from app.tools.youtube_downloader.router import _language_candidates, _select_transcript


def _transcript(code: str, *, generated: bool = True):
    item = MagicMock()
    item.language_code = code
    item.is_generated = generated
    return item


class FakeTranscriptList:
    def __init__(self, transcripts):
        self._transcripts = list(transcripts)

    def __iter__(self):
        return iter(self._transcripts)

    def find_transcript(self, language_codes):
        for code in language_codes:
            for transcript in self._transcripts:
                if transcript.language_code == code:
                    return transcript
        raise NoTranscriptFound("video", language_codes, self)


class YoutubeTranscriptLanguageTests(unittest.TestCase):
    def test_candidates_default_to_spanish_first(self):
        self.assertEqual(_language_candidates("")[0], "es")
        self.assertIn("en", _language_candidates(""))

    def test_candidates_keep_requested_language_first(self):
        self.assertEqual(_language_candidates("pt-BR")[:2], ["pt-BR", "pt"])

    def test_selects_spanish_instead_of_first_arabic_track(self):
        tracks = FakeTranscriptList(
            [
                _transcript("ar"),
                _transcript("zh-Hans"),
                _transcript("es"),
                _transcript("en"),
            ]
        )
        selected = _select_transcript(tracks)
        self.assertEqual(selected.language_code, "es")

    def test_selects_requested_language_when_present(self):
        tracks = FakeTranscriptList([_transcript("ar"), _transcript("en"), _transcript("es")])
        selected = _select_transcript(tracks, "en")
        self.assertEqual(selected.language_code, "en")

    def test_prefers_manual_caption_when_preferred_languages_missing(self):
        tracks = FakeTranscriptList(
            [
                _transcript("ar", generated=True),
                _transcript("ja", generated=False),
            ]
        )
        selected = _select_transcript(tracks)
        self.assertEqual(selected.language_code, "ja")


if __name__ == "__main__":
    unittest.main()
