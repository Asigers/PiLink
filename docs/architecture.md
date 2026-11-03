# PiLink Architecture

## Product boundary

PiLink is a personal control channel for one local Pi Agent. One instance links to one personal WeChat ClawBot account and one QR-login owner. It is not a multi-tenant bot platform and does not support group-chat routing in this milestone.

## Responsibilities

### WeChat iLink transport

The adapter owns QR login, token persistence, long polling, cursor persistence, inbound message deduplication, owner-only direct-message filtering, and outbound text delivery. The owner ID returned from QR login is the single authorized sender. The iLink context token is a reply credential, not an Agent session identifier.

### Bridge

The bridge owns one personal chat, active conversation selection, job queues, command handling, and reply delivery. Supported commands are /new, /status, /stop, and /help. The bridge must not call an LLM or decide an Agent plan.

### Pi RPC supervisor

The supervisor starts one Pi RPC process for each active Pi session. It uses the official RpcClient from @earendil-works/pi-coding-agent. A session must have one active writer. Workers may be stopped and restarted because Pi owns persistent JSONL session history.

### Pi runtime

Pi owns model inference, tool selection, built-in tools, extensions, skills, session history, and compaction. PiLink passes a stable session ID, session directory, workspace cwd, system prompt, extensions, and skills at process startup.

### Memory Engine

The Memory Engine is a separate PiLink subsystem, not a second Agent runtime.

- Pi JSONL remains the source of truth for complete conversation history and native compaction.
- A normalized conversation_turns ledger records only user-visible prompts and final answers for reliable, bounded memory ingestion.
- SQLite stores durable memory items, scope, provenance, versions, summaries, settings, and Dreaming jobs.
- Dreaming uses a dedicated, short-lived Pi RPC session with the same configured model/provider as the main agent. It proposes structured changes; deterministic TypeScript policy validates and persists them.
- A Pi extension retrieves only relevant global user memory and the active workspace's project memory, then adds a bounded prompt section before the Agent starts.
- Project memory is scoped by workspace_id; global user preferences use the installation's single-owner owner scope.
- Dreaming and retrieval must fail open: memory failure must not prevent ordinary Pi conversations.

## Identity and context

- One PiLink installation -> one iLink Bot credential set.
- QR login's ilink_user_id -> the only accepted sender.
- One personal direct chat -> one PiLink chat record.
- The active logical conversation -> one stable Pi session ID.
- context_token is stored with inbound messages and used only to reply to that WeChat conversation.
- get_updates_buf is stored in SQLite and advanced only after the returned batch is handled.
- Inbound message IDs are deduplicated in SQLite. Messages left in received state are retried if the cursor has not advanced.

## Concurrency

The same Pi session must never be written by two Pi processes simultaneously. The worker pool deduplicates concurrent starts within one process. Bridge jobs are queued per logical conversation. /stop aborts the active Pi run and cancels queued jobs for the current conversation. Dreaming uses a separate session ID and never writes to the user's conversation session.

## Context and memory boundaries

- Pi owns the current conversation transcript and automatic compaction.
- Memory items are cross-session continuity, not a replacement for conversation history.
- The only cross-project memory allowed by default is global user memory that is clearly applicable across projects.
- Retrieval is filtered in SQL to scope_type='user' AND scope_id='owner' plus the exact current workspace_id. Never rely on a prompt instruction alone to enforce project isolation.
- Memory content is treated as fallible context, not instructions. The user's latest explicit statement takes precedence.
- Large research material belongs in files and should be retrieved on demand, not copied into long-term memory.
- Secrets and credentials must never be automatically stored.

## Security

- Only direct messages from the QR-login owner are dispatched.
- Bot tokens are stored in a local credentials file with owner-only POSIX permissions; the file is ignored by Git. The contents are not encrypted by PiLink.
- Pi RPC is a child process over stdio; never expose its protocol on a network port.
- PiLink policy checks are not an OS sandbox.
- Run under a dedicated OS account or appropriately restricted environment before enabling unattended file or shell operations.
- Treat external web content and attachments as untrusted input.
- Dreaming receives only the selected turn batch and scoped memory slice, runs without tools/skills, and cannot directly write to the database.
