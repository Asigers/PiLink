# PiLink Architecture

## Responsibilities

### Channel adapter
The channel adapter translates platform-specific messages into a channel-neutral message contract. The first adapter target is Tencent WeChat iLink. It owns QR authentication, long polling, cursor persistence, context-token handling, media transfer, and outbound delivery.

### Bridge
The bridge owns identity checks, chat and conversation routing, jobs, approvals, message deduplication, progress aggregation, and an outbound queue. It must not call an LLM or decide an agent plan.

### Pi RPC supervisor
The supervisor starts one Pi RPC process for each active Pi session. It uses the official RpcClient from @earendil-works/pi-coding-agent. A session must have one active writer. Workers may be stopped and restarted because Pi owns persistent JSONL session history.

### Pi runtime
Pi owns model inference, tool selection, built-in tools, extensions, skills, session history, and compaction. PiLink passes a session ID, session directory, workspace cwd, system prompt, extensions, and skills at process startup.

### Tools
Reusable capabilities are exposed to Pi as extensions or MCP tools. The initial example is search_web, implemented with Brave Search. Browser automation, file ingestion, memory retrieval, and scheduling are later increments.

## Session identity

- channel account + chat type + peer ID -> one PiLink chat
- one chat -> many logical conversations
- one logical conversation -> one stable Pi session ID and workspace
- one conversation -> many jobs

The iLink context token is a reply credential. It is not a Pi session ID and must be stored separately from conversation identity.

## Concurrency

The same Pi session must never be written by two Pi processes simultaneously. The worker pool deduplicates concurrent starts within the process. Before adding multiple PiLink processes or distributed execution, add a durable lease/lock with expiry and owner identity.

## Context

Pi owns the JSONL transcript and automatic compaction. SQLite stores operational metadata and references only. Durable user and project memory should be curated separately; large research material belongs in files and should be retrieved on demand.

## Security

- Sender allowlist is fail-closed: an empty allowlist means no remote sender is authorized.
- Workspaces must be under explicitly configured roots.
- Pi RPC is a child process over stdio; never expose its protocol on a public port.
- PiLink policy checks are not an OS sandbox.
- Use a dedicated OS account or container for unattended execution.
- Add per-tool approvals before enabling destructive shell or file operations.
- Treat external web content and attachments as untrusted input.
