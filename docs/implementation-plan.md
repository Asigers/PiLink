# Implementation plan

## Milestone 0 — Pi RPC foundation

- Pin the Pi coding-agent package and Node runtime requirements.
- Start Pi through the official RpcClient.
- Give every logical conversation a stable Pi session ID and session directory.
- Serialize prompts per worker; expose steer, follow-up, abort, state, stats, and compaction.
- Verify process restart resumes the same session ID.

Acceptance: local RPC smoke test succeeds with the user's configured provider and prints streamed text.

## Milestone 1 — WeChat text loop

- Implement iLink QR login and secure token storage.
- Implement long polling, cursor persistence, message deduplication, and context-token-aware replies.
- Enforce a sender allowlist before routing messages.
- Connect the adapter to MessageRouter and the outbox.

Acceptance: an allowlisted WeChat user can exchange multiple messages with a persistent Pi conversation.

## Milestone 2 — Research tools

- Register Brave Search as a Pi tool.
- Add URL fetching and readable-content extraction.
- Add source-aware research skill and report export.
- Test API errors, timeouts, freshness filters, and prompt injection in page content.

Acceptance: Pi can search, inspect primary sources, cross-check, and return traceable URLs.

## Milestone 3 — Local operations and approvals

- Add workspace registry and canonical-path checks.
- Add file ingestion and attachment lifecycle.
- Implement a Pi Extension tool guard and a Bridge approval store.
- Bind approval decisions to a job, tool, and exact arguments.

Acceptance: safe local tasks run unattended; destructive or out-of-scope actions require explicit approval.

## Milestone 4 — Reliability and extended tools

- Add worker idle eviction, crash recovery, and per-session leases.
- Add Playwright MCP with an isolated browser profile.
- Add curated long-term memory and project memory.
- Add scheduler, job recovery, and notification delivery rules.

Acceptance: long-running tasks survive Bridge restarts and do not create duplicate Pi session writers.
