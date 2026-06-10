#!/usr/bin/env python3
"""
bench_routing.py
================
Performance benchmark for the chat endpoint routing.

Sends N requests to /api/chat on the local server, groups the responses by
`source`, and prints p50/p95/p99 latencies for each source.

Usage:
    1. Start the server:  python server.py
    2. Run the benchmark: python bench_routing.py

Or, optionally, save the result to a JSON file with --out.
"""

import argparse
import json
import os
import statistics
import sys
import time
import urllib.request
import urllib.error
from collections import defaultdict
from typing import Dict, List

# Load .env for PORT
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def percentile(values: List[float], p: float) -> float:
    """Return the p-th percentile of values (0 ≤ p ≤ 100)."""
    if not values:
        return 0.0
    sorted_v = sorted(values)
    k = (len(sorted_v) - 1) * (p / 100)
    f = int(k)
    c = min(f + 1, len(sorted_v) - 1)
    if f == c:
        return sorted_v[f]
    return sorted_v[f] + (sorted_v[c] - sorted_v[f]) * (k - f)


QUERIES = [
    ("trivial",   "你好嗎"),                # → ollama direct
    ("trivial",   "hi"),
    ("weather",   "search tomorrow weather"),  # → hermes_worker or hermes_agent_api
    ("weather",   "聽日首爾天氣點"),
    ("attraction","幫我排一個三日兩夜嘅行程"),  # → hermes (complex)
    ("simple_q",  "景福宮歷史"),                # → ollama
]


def send_one(url: str, query: str, timeout: int = 60) -> Dict:
    """Send one chat request and return (latency_ms, source, reply_len, error)."""
    payload = json.dumps({
        "message": query,
        "system": "",
        "history": [],
        "preferences": {"use_web_search": True, "use_offline_fallback": True},
        "trip_data": {},
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        latency_ms = (time.time() - start) * 1000
        return {
            "latency_ms": latency_ms,
            "source": body.get("source", "unknown"),
            "reply_len": len(body.get("reply", "")),
            "error": body.get("error"),
        }
    except urllib.error.URLError as e:
        latency_ms = (time.time() - start) * 1000
        return {"latency_ms": latency_ms, "source": "url_error", "reply_len": 0, "error": str(e)}
    except Exception as e:
        latency_ms = (time.time() - start) * 1000
        return {"latency_ms": latency_ms, "source": "exception", "reply_len": 0, "error": str(e)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="http://localhost")
    ap.add_argument("--port", type=int, default=int(os.getenv("PORT", 8082)))
    ap.add_argument("--runs", type=int, default=1, help="how many times to send each query")
    ap.add_argument("--out", default=None, help="optional JSON output file")
    args = ap.parse_args()

    url = f"{args.host}:{args.port}/api/chat"
    print(f"Benchmarking {url} ...")
    print(f"  runs per query = {args.runs}")
    print()

    grouped: Dict[str, List[float]] = defaultdict(list)
    all_results: List[Dict] = []

    for kind, q in QUERIES:
        for run in range(args.runs):
            label = f"[{kind:>9s}] '{q[:30]}{'...' if len(q) > 30 else ''}' (run {run + 1}/{args.runs})"
            print(f"  → {label}", end=" ", flush=True)
            res = send_one(url, q)
            grouped[res["source"]].append(res["latency_ms"])
            all_results.append({"kind": kind, "query": q, **res})
            err_suffix = f"  ERROR: {res['error']}" if res.get("error") else ""
            print(f"{res['latency_ms']:>8.1f} ms  source={res['source']:<22s}  len={res['reply_len']}{err_suffix}")

    print()
    print("=" * 70)
    print(f"{'Source':<25s} {'N':>3s} {'Mean':>10s} {'p50':>10s} {'p95':>10s} {'p99':>10s}")
    print("-" * 70)
    for source, lats in sorted(grouped.items()):
        print(f"{source:<25s} {len(lats):>3d} "
              f"{statistics.mean(lats):>9.1f}ms "
              f"{percentile(lats, 50):>9.1f}ms "
              f"{percentile(lats, 95):>9.1f}ms "
              f"{percentile(lats, 99):>9.1f}ms")
    print("=" * 70)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump({
                "url": url,
                "runs": args.runs,
                "results": all_results,
                "summary": {
                    source: {
                        "n": len(lats),
                        "mean_ms": statistics.mean(lats),
                        "p50_ms": percentile(lats, 50),
                        "p95_ms": percentile(lats, 95),
                        "p99_ms": percentile(lats, 99),
                    }
                    for source, lats in grouped.items()
                },
            }, f, ensure_ascii=False, indent=2)
        print(f"\nSaved to {args.out}")


if __name__ == "__main__":
    main()
