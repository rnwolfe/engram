#!/usr/bin/env python3
"""
sample-exec plugin fixture — reads JSON-lines from stdin and implements the
engram executable plugin protocol:
  - Responds to hello with hello_ack
  - Responds to enrich with 2 hardcoded episode records then done
"""

import json
import sys


def main():
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError as exc:
            print(json.dumps({"type": "error", "message": f"bad JSON: {exc}"}), flush=True)
            continue

        op = msg.get("op")

        if op == "hello":
            print(json.dumps({
                "type": "hello_ack",
                "contract_version": 1,
                "capabilities": {
                    "supported_auth": ["none"],
                    "supports_cursor": False,
                }
            }), flush=True)

        elif op == "enrich":
            print(json.dumps({
                "type": "episode",
                "source_type": "manual",
                "source_ref": "sample-exec-ep-1",
                "content": "Sample episode 1 from executable plugin",
                "timestamp": "2024-01-01T00:00:00Z",
            }), flush=True)

            print(json.dumps({
                "type": "episode",
                "source_type": "manual",
                "source_ref": "sample-exec-ep-2",
                "content": "Sample episode 2 from executable plugin",
                "timestamp": "2024-01-02T00:00:00Z",
            }), flush=True)

            print(json.dumps({"type": "done"}), flush=True)
            break

        else:
            print(json.dumps({"type": "error", "message": f"unknown op: {op}"}), flush=True)


if __name__ == "__main__":
    main()
