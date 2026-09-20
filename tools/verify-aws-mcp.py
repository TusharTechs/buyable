#!/usr/bin/env python3
"""
Proves this repository's coding agent is connected to AWS through the AWS MCP Server.

Speaks MCP over stdio to the same proxy command that .mcp.json configures, performs
the initialize handshake, and lists the tools the server exposes. Run it yourself:

    python3 tools/verify-aws-mcp.py

Deliberately independent of any particular client. The claim being evidenced is that
the configuration in .mcp.json genuinely reaches AWS with this account's credentials,
and that is a property of the configuration rather than of whatever happens to be
reading it.
"""
import json
import subprocess
import sys
import datetime

CMD = [
    "uvx", "mcp-proxy-for-aws-cli@latest",
    "https://aws-mcp.us-east-1.api.aws/mcp",
    "--metadata", "AWS_REGION=us-west-2",
]

def main() -> int:
    proc = subprocess.Popen(
        CMD, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, text=True, bufsize=1,
    )

    def send(msg):
        proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()

    def read():
        line = proc.stdout.readline()
        return json.loads(line) if line.strip() else None

    send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2025-06-18", "capabilities": {},
        "clientInfo": {"name": "buyable-verify", "version": "1.0"}}})
    init = read()
    if not init or "result" not in init:
        print("handshake failed:", init)
        return 1

    server = init["result"]["serverInfo"]
    print(f"connected to: {server['name']} {server['version']}")
    print(f"protocol:     {init['result']['protocolVersion']}")
    print(f"checked at:   {datetime.datetime.now(datetime.UTC).isoformat()}")

    send({"jsonrpc": "2.0", "method": "notifications/initialized"})
    send({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})

    tools = read()
    proc.stdin.close()
    proc.terminate()

    if not tools or "result" not in tools:
        print("tools/list failed:", tools)
        return 1

    names = [t["name"] for t in tools["result"]["tools"]]
    print(f"tools exposed: {len(names)}")
    for name in sorted(names):
        print(f"  {name}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
