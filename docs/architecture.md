# PiLink Architecture

## Product boundary

PiLink is a personal control channel for one local Pi Agent. One instance links to one personal WeChat ClawBot account and one QR-login owner. It is not a multi-tenant bot platform and does not support group-chat routing in this milestone.

## Responsibilities

### WeChat iLink transport

The adapter owns QR login, token persistence, long polling, cursor persistence, inbound message deduplication, owner-only direct-message filtering, and outbound text delivery. The owner ID returned by QR login is the single authorized sender. The iLink context token is a reply credential, not an Agent session identifier.

### Bridge

The bridge owns one personal chat, active conversation selection, job queues, command handling, and reply delivery. Supported commands are /new, /status, /stop, and /help. The bridge must not call an LLM or decide an Agent plan.

### Pi RPC supervisor

The supervisor starts one Pi RPC process for each active Pi session. It uses the official RpcClient from @earendil-works/pi-coding-agent. A session must have one active writer. Workers may be stopped and restarted because Pi owns persistent JSONL session history.

### Pi runtime

Pi owns model inference, tool selection, built-in tools, extensions, skills, session history, and compaction. PiLink passes a stable session ID, session directory, workspace cwd, system prompt, extensions, and skills at process startup.

## Identity and context

- One PiLink installation -> one iLink Bot credential set.
- QR login's ilink_user_id -> the only accepted sender.
- One personal direct chat -> one PiLink chat record.
- The active logical conversation -> one stable Pi session ID.
- context_token is stored with inbound messages and used only to reply to that WeChat conversation.
- get_updates_buf is stored in SQLite and advanced only after the returned batch is handled.
- Inbound message IDs are deduplicated in SQLite. Messages left in received state are retried if the cursor has not advanced.

## Concurrency

The same Pi session must never be written by two Pi processes simultaneously. The worker pool deduplicates concurrent starts within one process. Bridge jobs are queued per logical conversation. /stop aborts the active Pi run and cancels queued jobs for the current conversation.

## Context

Pi owns the JSONL transcript and automatic compaction. SQLite stores operational metadata and references only. Durable user/project memory should be curated separately; large research material belongs in files and should be retrieved on demand.

## Security

- Only direct messages from the QR-login owner are dispatched.
- Bot tokens are stored in a local credentials file with owner-only POSIX permissions; the file is ignored by Git. The contents are not encrypted by PiLink.
- Pi RPC is a child process over stdio; never expose its protocol on a network port.
- PiLink policy checks are not an OS sandbox.
- Run under a dedicated OS account or appropriately restricted environment before enabling unattended file or shell operations.
- Treat external web content and attachments as untrusted input.
