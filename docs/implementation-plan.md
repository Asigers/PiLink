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
- [x] Complete a real WeChat -> Pi RPC -> WeChat round trip on the owner's Mac.

Acceptance: CI verifies the code and protocol payloads. Real account acceptance is performed on the owner's Mac because GitHub Actions cannot use the owner's WeChat session or QR credentials.

## Milestone 2 — PiLink Memory V1

Design: [docs/memory-architecture.md](memory-architecture.md). Product decisions are confirmed: hybrid automatic memory, global user preferences plus isolated workspace memory, and Dreaming on the configured Pi model.

### Phase A — Foundation

- [ ] Add schema v3: conversation_turns, memory_items, memory_sources, memory_versions, memory_summaries, memory_jobs, memory_settings, memory_suppressions, and retrieval audit.
- [ ] Record user-visible user/assistant turns with conversation, Pi session, and workspace provenance.
- [ ] Implement MemoryRepository with transactional create/update/version/source/delete.
- [ ] Implement global owner scope and workspace-scoped project scope.
- [ ] Add owner-level capture/retrieval settings.
- [ ] Add /memory, /memory search, /memory show, /memory sources, /memory edit, and forget preview/confirmation.

### Phase B — Dreaming

- [ ] Add durable, coalesced memory jobs with leases, bounded retries, and startup recovery.
- [ ] Use a dedicated short-lived Pi RPC session with the same configured provider/model.
- [ ] Add a dedicated Dreaming prompt and a no-tools guard extension.
- [ ] Validate structured proposals with Zod and deterministic scope/privacy/importance policy.
- [ ] Generate derived summaries from validated active memory items.
- [ ] Trigger after 3 eligible turns / 60 seconds idle; explicit remember and /memory refresh run immediately.

### Phase C — Retrieval

- [ ] Add FTS5/trigram search and short-query fallback.
- [ ] Add pilink-memory-context Pi extension using before_agent_start.
- [ ] Inject only relevant global + current-workspace memories within a bounded token budget.
- [ ] Add retrieval observability and fail-open behavior.
- [ ] Test global preference sharing and cross-project isolation.

### Phase D — Quality and operations

- [ ] Verify and implement historical Pi-session backfill through the supported Pi session reader.
- [ ] Add conflict review, stale-memory handling, and quality diagnostics.
- [ ] Add export/import and richer natural-language corrections.

Acceptance: a new Pi session recalls relevant durable user preferences and current-project facts; other project memories are never injected; memories have inspectable sources and versions; owner corrections win; forgotten memories are suppressed from re-learning; Dreaming is asynchronous, restart-safe, and tool-free.

## Milestone 3 — Research tools

- [ ] Register and validate Brave Search as a Pi tool.
- [ ] Add URL fetching and readable-content extraction.
- [ ] Add source-aware research skill and report export.
- [ ] Test API errors, timeouts, freshness filters, and prompt injection in page content.

Acceptance: Pi can search, inspect primary sources, cross-check, and return traceable URLs.

## Milestone 4 — Local operations and approvals

- [ ] Add workspace registry and canonical-path checks.
- [ ] Add file ingestion and attachment lifecycle.
- [ ] Implement a Pi Extension tool guard and a Bridge approval store.
- [ ] Bind approval decisions to a job, tool, and exact arguments.

Acceptance: safe local tasks run unattended; destructive or out-of-scope actions require explicit approval.

## Milestone 5 — Reliability and extended tools

- [ ] Add worker idle eviction, crash recovery, and per-session leases.
- [ ] Add a durable outbound outbox and recovery for interrupted jobs.
- [ ] Add Playwright MCP with an isolated browser profile.
- [ ] Add scheduler and notification delivery rules.

Acceptance: long-running tasks survive Bridge restarts and do not create duplicate Pi session writers.
