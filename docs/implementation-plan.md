# Implementation plan

## Milestone 0 — Pi RPC foundation

- [x] Pin the Pi coding-agent package and Node runtime requirements.
- [x] Start Pi through the official RpcClient.
- [x] Give each logical conversation a stable Pi session ID and session directory.
- [x] Serialize prompts per worker and expose abort/state/stats/compaction.
- [x] Add a persistent local RPC smoke-test harness.

Acceptance: the automated RPC harness is implemented. A real provider/model run and process-restart resume still need to be confirmed on the target Mac.

## Milestone 1 — Personal WeChat text loop

Implementation status: **code complete; live-account acceptance pending**.

- [x] Implement iLink QR login, QR refresh, redirect handling, and optional verification-code prompt.
- [x] Store one Bot token and QR-login owner ID in a local credentials file with owner-only POSIX permissions.
- [x] Implement iLink request headers, long polling, business error handling, and stale-token detection.
- [x] Persist get_updates_buf in SQLite and deduplicate inbound messages.
- [x] Accept only direct messages from the QR-login owner; no multi-user mapping or group-chat support.
- [x] Preserve the inbound context_token for replies.
- [x] Connect the transport, MessageRouter, JobManager, WorkerPool, and Pi RPC.
- [x] Add /new, /status, /stop, and /help commands.
- [x] Add local start/login/logout/status commands and protocol/unit tests.
- [ ] Run QR login and exchange real messages with the owner's WeChat account on the target Mac.
- [ ] Verify stop, restart, and stale-token recovery against the live iLink service.

Acceptance: CI verifies the code and protocol payloads. Real account acceptance remains a local step because PiLink cannot use the owner's WeChat session or QR credentials in GitHub Actions.

## Milestone 2 — Research tools

- [ ] Register and validate Brave Search as a Pi tool.
- [ ] Add URL fetching and readable-content extraction.
- [ ] Add source-aware research skill and report export.
- [ ] Test API errors, timeouts, freshness filters, and prompt injection in page content.

Acceptance: Pi can search, inspect primary sources, cross-check, and return traceable URLs.

## Milestone 3 — Local operations and approvals

- [ ] Add workspace registry and canonical-path checks.
- [ ] Add file ingestion and attachment lifecycle.
- [ ] Implement a Pi Extension tool guard and a Bridge approval store.
- [ ] Bind approval decisions to a job, tool, and exact arguments.

Acceptance: safe local tasks run unattended; destructive or out-of-scope actions require explicit approval.

## Milestone 4 — Reliability and extended tools

- [ ] Add worker idle eviction, crash recovery, and per-session leases.
- [ ] Add a durable outbound outbox and recovery for interrupted jobs.
- [ ] Add Playwright MCP with an isolated browser profile.
- [ ] Add curated long-term memory and project memory.
- [ ] Add scheduler and notification delivery rules.

Acceptance: long-running tasks survive Bridge restarts and do not create duplicate Pi session writers.
