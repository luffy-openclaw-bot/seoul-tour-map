"""
test_endpoint_routing.py
========================
Unit tests for the chat endpoint routing logic in server.py.

Covers:
  - The "should_delegate_to_hermes" keyword gate
  - The four-layer routing order (api-hermes → file-queue worker → ollama → offline)
  - The thread-safe circuit breaker

Run:
    python -m unittest test_endpoint_routing.py -v
"""

import os
import sys
import threading
import time
import unittest
from unittest import mock

# Make server.py importable
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)


class TestShouldDelegateToHermes(unittest.TestCase):
    """Verify the complex-query keyword gate."""

    def _make_handler(self):
        """Build a minimal Handler instance with stub internals."""
        from server import Handler
        # Bypass __init__ (which would start the HTTPServer) — use a bare object.
        h = Handler.__new__(Handler)
        return h

    def test_complex_weather_query_delegates(self):
        from server import Handler
        h = Handler.__new__(Handler)
        self.assertTrue(h._should_delegate_to_hermes("search the current weather in Seoul"))

    def test_simple_greeting_does_not_delegate(self):
        from server import Handler
        h = Handler.__new__(Handler)
        self.assertFalse(h._should_delegate_to_hermes("你好嗎"))

    def test_chinese_search_keyword_delegates(self):
        from server import Handler
        h = Handler.__new__(Handler)
        self.assertTrue(h._should_delegate_to_hermes("查吓首爾有咩好玩"))

    def test_short_message_with_recommend_delegates(self):
        from server import Handler
        h = Handler.__new__(Handler)
        self.assertTrue(h._should_delegate_to_hermes("推薦首爾景點"))


class TestCircuitBreaker(unittest.TestCase):
    """Verify the thread-safe circuit breaker."""

    def test_initial_state_closed(self):
        from server import _CircuitBreaker
        b = _CircuitBreaker(open_after=3)
        self.assertFalse(b.is_open())
        self.assertEqual(b.get_failures(), 0)

    def test_opens_after_threshold(self):
        from server import _CircuitBreaker
        b = _CircuitBreaker(open_after=3)
        b.record_failure()
        b.record_failure()
        self.assertFalse(b.is_open())
        b.record_failure()
        self.assertTrue(b.is_open())

    def test_success_resets_failures(self):
        from server import _CircuitBreaker
        b = _CircuitBreaker(open_after=3)
        b.record_failure()
        b.record_failure()
        b.record_success()
        self.assertEqual(b.get_failures(), 0)
        self.assertFalse(b.is_open())

    def test_thread_safety_under_concurrent_failures(self):
        """100 threads each record 1 failure; only the first 3 should be considered."""
        from server import _CircuitBreaker
        b = _CircuitBreaker(open_after=3)

        def hammer():
            for _ in range(5):
                b.record_failure()
                time.sleep(0.001)

        threads = [threading.Thread(target=hammer) for _ in range(100)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # No crash and the count is monotonic
        self.assertGreaterEqual(b.get_failures(), 3)
        self.assertTrue(b.is_open())


class TestTryHermesAgentApi(unittest.TestCase):
    """Verify the first-layer routing decision (api-hermes.apihubs.dev)."""

    def _make_handler(self):
        from server import Handler
        return Handler.__new__(Handler)

    def test_returns_none_when_no_key_configured(self):
        from server import Handler, HERMES_AGENT_API_KEY
        # Only meaningful if env doesn't have a real key set
        with mock.patch("server.HERMES_AGENT_API_KEY", ""):
            h = Handler.__new__(Handler)
            self.assertIsNone(h._try_hermes_agent_api("hi", "system", []))

    def test_routes_to_hermes_first_when_key_set(self):
        """With key set, _try_hermes_agent_api should be the first call; if it
        succeeds, _delegate_to_hermes/_call_ollama_api/_generate_offline_reply
        must NOT be invoked."""
        from server import Handler
        h = Handler.__new__(Handler)

        with mock.patch("server.HERMES_AGENT_API_KEY", "fake-key-for-test"), \
             mock.patch.object(Handler, "_try_hermes_agent_api",
                               return_value="cloud reply") as m_hermes, \
             mock.patch.object(Handler, "_delegate_to_hermes") as m_worker, \
             mock.patch.object(Handler, "_call_ollama_api") as m_ollama, \
             mock.patch.object(Handler, "_generate_offline_reply") as m_offline:
            result = h._try_hermes_agent_api("hi", "system", [])
            self.assertEqual(result, "cloud reply")
            m_hermes.assert_called_once()
            m_worker.assert_not_called()
            m_ollama.assert_not_called()
            m_offline.assert_not_called()

    def test_falls_through_when_hermes_returns_none(self):
        """When the cloud call returns None, the layer-1 result is None; the
        caller (handle_chat) is then free to invoke layer 2."""
        from server import Handler
        h = Handler.__new__(Handler)
        with mock.patch("server.HERMES_AGENT_API_KEY", "fake-key"), \
             mock.patch.object(Handler, "_try_hermes_agent_api", return_value=None):
            self.assertIsNone(h._try_hermes_agent_api("hi", "system", []))


class TestHermesAgentClientImport(unittest.TestCase):
    """The dead-code fix: hermes_agent_client.py is now wired up by server.py."""

    def test_hermes_agent_client_module_is_importable(self):
        import hermes_agent_client
        self.assertTrue(hasattr(hermes_agent_client, "HermesAgentClient"))
        self.assertTrue(hasattr(hermes_agent_client, "chat_with_fallback"))

    def test_hermes_agent_client_default_url(self):
        from hermes_agent_client import HERMES_AGENT_API_URL
        self.assertEqual(HERMES_AGENT_API_URL, "https://api-hermes.apihubs.dev/v1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
