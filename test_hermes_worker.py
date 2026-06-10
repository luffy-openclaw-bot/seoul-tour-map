"""
test_hermes_worker.py
=====================
Unit tests for hermes_worker.py

Covers:
  - should_search_web keyword gate
  - web_search_duckduckgo regex resilience (no crash on weird HTML)
  - Idempotent file removal (B3 regression)
  - search_status='failed' injection (B7 regression)

Run:
    python -m unittest test_hermes_worker.py -v
"""

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

# Make hermes_worker.py importable
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

import hermes_worker


class TestShouldSearchWeb(unittest.TestCase):
    def test_weather_keyword_triggers(self):
        self.assertTrue(hermes_worker.should_search_web("search tomorrow weather"))
        self.assertTrue(hermes_worker.should_search_web("聽日天氣點樣"))
        self.assertTrue(hermes_worker.should_search_web("today's temperature"))

    def test_unrelated_message_does_not_trigger(self):
        self.assertFalse(hermes_worker.should_search_web("景福宮歷史"))
        self.assertFalse(hermes_worker.should_search_web("hello world"))


class TestWebSearchRegexRobustness(unittest.TestCase):
    """Make sure the DuckDuckGo scraper doesn't crash on weird HTML."""

    @mock.patch.object(hermes_worker, "create_urllib_opener")
    def test_empty_html_returns_empty_list(self, m_opener):
        m_opener.return_value.open.return_value.__enter__.return_value.read.return_value = b""
        results = hermes_worker.web_search_duckduckgo("test", max_results=3)
        self.assertEqual(results, [])

    @mock.patch.object(hermes_worker, "create_urllib_opener")
    def test_garbage_html_returns_empty_list(self, m_opener):
        m_opener.return_value.open.return_value.__enter__.return_value.read.return_value = b"<html>not duckduckgo at all</html>"
        results = hermes_worker.web_search_duckduckgo("test", max_results=3)
        self.assertEqual(results, [])

    @mock.patch.object(hermes_worker, "create_urllib_opener")
    def test_connection_error_returns_empty_list(self, m_opener):
        m_opener.return_value.open.side_effect = OSError("network down")
        results = hermes_worker.web_search_duckduckgo("test", max_results=3)
        self.assertEqual(results, [])

    @mock.patch.object(hermes_worker, "create_urllib_opener")
    def test_html_with_result_block_regex_parses_title(self, m_opener):
        # Build a minimal DuckDuckGo result block: <div class="result__body">...</div></div>
        # The worker's primary regex needs the closing </div></div> pattern.
        html = b'''
        <div class="result">
          <div class="result__body">
            <a class="result__a" href="https://example.com">Hello</a>
            <a class="result__url" href="https://example.com">example.com</a>
            <a class="result__snippet">Snippet text</a>
          </div>
        </div>
        <div class="result">
          <div class="result__body">
            <a class="result__a" href="https://example.org">World</a>
            <a class="result__url" href="https://example.org">example.org</a>
            <a class="result__snippet">Snippet two</a>
          </div>
        </div>
        '''
        m_opener.return_value.open.return_value.__enter__.return_value.read.return_value = html
        results = hermes_worker.web_search_duckduckgo("test", max_results=3)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["title"], "Hello")
        self.assertEqual(results[0]["url"], "example.com")
        self.assertEqual(results[1]["title"], "World")


class TestIdempotentFileRemove(unittest.TestCase):
    """B3: removing a file that no longer exists must not raise FileNotFoundError."""

    def test_remove_missing_file_does_not_raise(self):
        with tempfile.TemporaryDirectory() as tmp:
            request_file = os.path.join(tmp, "request_does_not_exist.json")
            # Pre-condition: file does not exist
            self.assertFalse(os.path.exists(request_file))
            # The pattern used by the worker:
            try:
                if os.path.exists(request_file):
                    os.remove(request_file)
            except FileNotFoundError:
                self.fail("os.path.exists guard should prevent FileNotFoundError")
            # Post-condition: still does not exist, no exception
            self.assertFalse(os.path.exists(request_file))


class TestSearchStatusInjection(unittest.TestCase):
    """B7: when web search returns 0 results and do_search is True, the worker
    should inject an explicit 'search failed' context for the LLM."""

    def test_process_request_injects_failed_context(self):
        """We mock out the Ollama call to capture what context was passed in."""
        with tempfile.TemporaryDirectory() as tmp:
            # Patch HERMES_TASK_DIR
            with mock.patch.object(hermes_worker, "HERMES_TASK_DIR", tmp):
                # Build a fake request file
                request_file = os.path.join(tmp, "request_test-001.json")
                payload = {
                    "id": "test-001",
                    "message": "search tomorrow weather",
                    "system": "",
                    "history": [],
                    "context": "seoul-tour-map chatbot",
                    "timestamp": 0.0,
                }
                with open(request_file, "w", encoding="utf-8") as f:
                    json.dump(payload, f)

                # Mock the network calls
                with mock.patch.object(hermes_worker, "web_search_duckduckgo",
                                       return_value=[]), \
                     mock.patch.object(hermes_worker, "call_ollama_api",
                                       return_value="AI reply") as m_ollama:
                    hermes_worker.process_request(request_file)

                # Verify Ollama was called with a non-None search_context
                self.assertTrue(m_ollama.called)
                _args, kwargs = m_ollama.call_args
                # call_ollama_api(full_system, user_message, search_context, chat_history)
                self.assertEqual(m_ollama.call_args.args[1], "search tomorrow weather")
                search_context = m_ollama.call_args.args[2]
                self.assertIsNotNone(search_context, "search_context should be non-None when web search is attempted and fails")
                self.assertIn("搜尋失敗", search_context)

                # Verify response file was written
                response_file = os.path.join(tmp, "response_test-001.json")
                self.assertTrue(os.path.exists(response_file))
                with open(response_file, "r", encoding="utf-8") as f:
                    response = json.load(f)
                self.assertEqual(response["search_status"], "failed")

    def test_process_request_request_file_idempotent_remove(self):
        """If the request file is already gone (e.g. server.py deleted it),
        process_request should NOT raise FileNotFoundError on cleanup."""
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(hermes_worker, "HERMES_TASK_DIR", tmp):
                # Build the request, then delete it before process_request runs
                request_file = os.path.join(tmp, "request_ghost.json")
                payload = {
                    "id": "ghost",
                    "message": "hello",
                    "system": "",
                    "history": [],
                    "context": "",
                    "timestamp": 0.0,
                }
                with open(request_file, "w", encoding="utf-8") as f:
                    json.dump(payload, f)
                os.remove(request_file)  # Pretend server.py already deleted it

                with mock.patch.object(hermes_worker, "call_ollama_api",
                                       return_value="ok"):
                    # Should NOT raise
                    try:
                        hermes_worker.process_request(request_file)
                    except FileNotFoundError as e:
                        self.fail(f"process_request should be idempotent: {e}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
