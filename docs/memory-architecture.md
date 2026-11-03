# PiLink Memory V1 — Technical Design

**Status:** Design approved; implementation not started  
**Decision set:** Hybrid automatic memory · isolated project scopes with shared global preferences · same Pi Agent model for Dreaming  
**Target:** Single-owner, local-first PiLink deployment

## 1. Goals and non-goals

### Goals

PiLink Memory should provide ChatGPT-like continuity across independent Pi sessions:

- Learn durable user facts, preferences, constraints, and goals from conversations.
- Keep project facts, decisions, and project history isolated by workspace.
- Share only genuinely global user preferences/profile facts across projects.
- Consolidate and revise memories asynchronously instead of appending an ever-growing file.
- Retrieve only relevant memories for the current request.
- Preserve provenance so a memory can be inspected and corrected.
- Allow the owner to pause, inspect, edit, and delete memories.
- Survive PiLink restarts without losing pending Dreaming work.

### Non-goals for V1

- Replacing Pi's native JSONL session history or compaction.
- Uploading a complete conversation archive to a separate vector database.
- Multi-user, tenant, group-chat, or cloud-synchronized memory.
- Embedding/vector search or a separate embedding model.
- Autonomous deletion of memories based only on model judgment.
- Treating arbitrary web pages, tool output, or assistant speculation as facts about the owner.
- Replicating OpenAI's private implementation. This design reproduces useful observable behavior, not proprietary internals.

## 2. Confirmed product decisions

| Decision | V1 behavior |
|---|---|
| Automatic memory | Hybrid: extract important information automatically; explicit "remember this" requests are high priority; owner can correct or delete |
| Scope | Global user memory is shared; project memory is isolated by workspace_id |
| Dreaming model | Use the same configured Pi model/provider as the main PiLink agent; no separate low-cost model |
| Storage | Existing local SQLite database |
| Original conversation | Pi JSONL session remains the source of truth |
| Retrieval | SQLite FTS5 lexical retrieval with Chinese-friendly substring/trigram strategy and a safe fallback |
| Context injection | Pi extension hook, not manual concatenation into every Bridge prompt |
| Privacy | Local persistence; only selected conversation batches and scoped memory are sent to the same model provider during Dreaming |

## 3. Conceptual architecture

~~~text
WeChat / Pi RPC conversations
          |
          v
ConversationTurnRecorder
  - records user-visible prompt and final assistant answer
  - associates turn with conversation, Pi session, workspace
          |
          v
SQLite: conversation_turns
          |
          +-----------------------------+
          |                             |
          v                             v
MemoryJobQueue                    Pi native JSONL
  - durable pending jobs           - full transcript
  - batching/coalescing             - source of truth
  - retry/recovery                  - native compaction
          |
          v
DreamingEngine
  - dedicated one-shot Pi RPC worker
  - same configured model/provider
  - isolated memory system prompt
  - no tools, no skills, no project workspace access
  - structured candidate output only
          |
          v
MemoryPolicy + MemoryRepository
  - deterministic scope/privacy validation
  - dedupe, merge, conflict handling
  - provenance and version history
          |
          +-----------------------------+
          |                             |
          v                             v
memory_items / summaries          memory_sources / versions
          |
          v
MemoryRetrieval
  - global user scope + current workspace scope only
  - relevance, importance, confidence, recency
          |
          v
Pi memory extension: before_agent_start
  - add a bounded pilink_memory system-prompt section
  - remove the section when no memories are relevant
          |
          v
Main Pi Agent
~~~

The Bridge remains the routing and lifecycle layer. It does not become a second reasoning engine. The Pi model proposes memory candidates; deterministic TypeScript policy decides what can be persisted.

## 4. Memory scopes and isolation

### 4.1 Global user scope

Use one installation-local scope ID, owner, because this product instance has exactly one linked owner.

Allowed global categories:

- profile: stable, non-sensitive user facts.
- preference: durable response, tooling, and workflow preferences.
- constraint: enduring constraints that apply across projects.
- goal: long-running personal or professional goals.
- environment: stable development environment details.

Examples:

- Prefers implementation-ready technical plans.
- Prefers local-first solutions when practical.
- Uses macOS as a primary development environment.

A candidate is global only if it clearly applies across projects. When uncertain, keep it project-scoped.

### 4.2 Project scope

Project memory is keyed by the conversation's workspace_id, not by an LLM guess based on message text.

Allowed project categories:

- project_fact
- decision
- constraint
- status
- milestone
- episode

Examples:

- PiLink uses the official Pi RPC client.
- The WeChat adapter accepts only the QR-login owner.
- The next planned milestone is long-term memory.

Never retrieve Project A memories while a Project B workspace is active. A project memory may be promoted to global scope only by an explicit owner action.

**Current repository limitation:** the current configuration creates only the default workspace. V1 memory scope isolation is enforced by workspace_id; multiple independent project memories become useful when the workspace registry/mapping assigns distinct stable workspace IDs. Do not silently infer project identity from arbitrary prompt text.

### 4.3 Retrieval rule

For a conversation with workspace W, the only eligible scopes are:

1. Global user scope owner.
2. Project scope W.

There is no "search all projects" fallback. A future explicit cross-project search command may be added, but it must be an owner-initiated action and clearly label the source project.

## 5. Memory types and lifecycle

A memory item has a kind and category.

- semantic: durable facts, preferences, constraints, goals, decisions.
- episode: a concise record of an important event, outcome, or milestone.

Each item has:

- Stable memory_key used for deduplication and updates.
- Human-readable content.
- scope_type and scope_id.
- confidence and importance in the range 0–1.
- Provenance links to one or more conversation turns.
- status: active, superseded, contested, or deleted.
- valid_from, optional valid_until, and timestamps.
- authority: automatic, explicit, or owner_corrected.

The current active item is the source of truth. A summary is a derived, rebuildable view.

### 5.1 Candidate acceptance policy

The Dreaming model returns proposals; it cannot write SQL or directly mutate memory.

Default automatic acceptance:

- Confidence >= 0.80.
- Importance >= 0.65.
- At least one valid source turn.
- Source turn belongs to the batch being processed.
- Candidate passes scope, privacy, length, and suppression checks.

An explicit owner request such as "记住：以后优先使用本地部署方案" bypasses the importance threshold, but not validation or secret filtering.

The model must not infer a personal preference from its own recommendation. For example, an assistant suggesting a framework does not mean the owner prefers it. Prefer direct user statements and owner-confirmed decisions as evidence.

### 5.2 Deduplication and updates

- Same scope + same memory_key + equivalent content: merge source references and refresh confirmation metadata.
- Same key + newer explicit owner statement: create a version and update the active item.
- Conflicting inferred candidates without clear owner confirmation: mark the item contested; do not silently choose one.
- A user correction always has higher authority than an inferred candidate.
- Do not automatically delete memories because they are old. Use valid_until for facts that are explicitly time-bounded and mark stale candidates for review.

### 5.3 Sensitive information

Never automatically store passwords, API keys, OAuth tokens, cookies, private keys, recovery codes, government ID numbers, or bank/payment credentials.

Do not automatically infer or store highly sensitive personal categories. An explicit request can be considered only after a clear confirmation flow; credentials and authentication secrets remain prohibited.

Web pages, search results, tool output, and untrusted attachments are not evidence of the owner's personal preferences or identity. They may inform project facts only when the owner explicitly adopts or confirms them.

## 6. Conversation capture and source provenance

### 6.1 Normalized turn ledger

Add conversation_turns as a small, local memory-ingestion ledger. It stores only user-visible text needed by Dreaming:

- user prompt,
- final assistant response,
- conversation ID,
- job ID,
- Pi session ID,
- workspace ID,
- status and timestamps,
- memory eligibility / opt-out flags,
- memory processing timestamp.

The ledger is not a replacement for Pi JSONL. Pi JSONL remains the complete native transcript and is used for normal conversation resume and compaction.

The Bridge writes the user prompt when it creates a job, then writes the final assistant text when the job completes. Failed/aborted jobs are retained as incomplete turns but are excluded from automatic memory extraction by default.

### 6.2 Existing-session backfill

Do not parse Pi JSONL with ad-hoc string splitting. First verify the supported session reader/parser exported by the pinned Pi package. Add a TranscriptSourceReader adapter around that supported API.

If no stable reader is available in the pinned package, V1 starts capturing new turns and reports that older sessions have not been backfilled. A later import command can backfill history after the parser is tested against real session fixtures.

### 6.3 Provenance

Each memory source records:

- source conversation ID,
- Pi session ID,
- turn ID,
- source type (automatic, explicit, owner_correction),
- source timestamp,
- optional content hash.

Do not copy entire transcripts into memory_sources. A memory item should be inspectable by following its source turn back to the local turn ledger / Pi session.

## 7. Dreaming engine

### 7.1 Trigger and batching

V1 does not require the future general-purpose Scheduler.

- After each completed user/assistant turn, update the pending memory-ingestion state.
- Automatically enqueue Dreaming after 3 eligible, unprocessed turns or after a 60-second quiet period.
- Explicit "remember this" requests enqueue immediately.
- /memory refresh forces a batch.
- Coalesce pending work per conversation/scope; never start two Dreaming jobs for the same scope concurrently.
- Batch at most 20 turns per model call. Remaining turns stay pending for the next batch.

These values are configuration defaults, not hard-coded product policy.

### 7.2 Model and isolation

Use the same configured Pi provider/model as the main PiLink Agent. Do not introduce another model setting in V1.

Each Dreaming batch runs in a dedicated, short-lived Pi RPC session under data/memory-sessions/, not in the user's active conversation. It receives:

- the eligible turns in the batch,
- the current global summary,
- only the current project's summary/items,
- the batch's explicit-memory intent markers.

It must not receive other project memories, unrelated sessions, the user's whole Pi agent directory, or the entire database.

The Dreaming worker starts with the pinned Pi CLI's --no-tools, --no-extensions, --no-skills, and --no-context-files flags, with no explicit extensions or skills. It uses a dedicated system prompt and a managed working directory, not the user's project workspace. Verify every safety flag against the pinned 1.5.0 CLI in an integration test; if a required flag is unavailable or extension discovery cannot be reliably disabled, fail closed and do not run Dreaming. The existing PI_CODING_AGENT_DIR remains available for the same provider/model configuration and authentication, but its user extensions and skills must not load in the Dreaming process.

The worker returns structured JSON proposals only. It is stopped after the batch; it does not share a long-lived transcript with the user's sessions.

**Model-selection caveat:** V1 uses the same Pi default configured model/provider. If a user manually overrides the model only inside one conversation, that per-session override is not assumed to transfer to Dreaming unless the pinned RPC API exposes a supported way to read and reproduce it.

### 7.3 Structured output contract

The model output is validated with Zod before any write. Conceptual shape:

~~~json
{
  "candidates": [
    {
      "action": "create",
      "scope": "global",
      "kind": "semantic",
      "category": "preference",
      "memory_key": "solution_deployment_preference",
      "content": "Prefers local deployment when it is practical.",
      "confidence": 0.94,
      "importance": 0.86,
      "source_turn_ids": ["turn-id"],
      "valid_until": null
    }
  ],
  "summary": {
    "sections": [
      {
        "title": "Preferences",
        "items": [
          {
            "memory_key": "solution_deployment_preference",
            "text": "Prefers local deployment when practical."
          }
        ]
      }
    ]
  }
}
~~~

The model cannot supply arbitrary scope IDs. The validator assigns the current project scope itself. Global scope is permitted only for the approved global categories and evidence that is clearly cross-project.

Summary bullets must reference existing active memory keys. Summary content is derived and rebuildable; retrieval must still work if summary generation fails.

### 7.4 Durable job lifecycle

memory_jobs states:

- queued
- running
- completed
- failed
- cancelled

Claim jobs transactionally in SQLite. Store attempts, started_at, completed_at, next_retry_at, and a lease expiry. On startup, reclaim expired running jobs and retry with bounded exponential backoff. Use an idempotency key based on scope + source-turn range so restart/retry does not create duplicate memory versions.

Dreaming failure must never block the user's normal Pi response. Log the failure and leave source turns eligible for retry.

## 8. Retrieval and Pi integration

### 8.1 Search strategy

V1 uses local SQLite only:

1. Filter to active global items and the exact current project scope.
2. Query FTS5 with a trigram tokenizer for Chinese substring matching where supported.
3. Use a bounded LIKE fallback for short queries or SQLite builds without the trigram tokenizer.
4. Rank by lexical relevance, then importance, confidence, owner-confirmed authority, and recency.
5. Return a small top set (default max 8 items / approximately 1,800 tokens).

Do not add embeddings, an external vector store, or a second embedding model in V1. Add semantic search only if measured retrieval misses justify it.

### 8.2 Prompt injection

Load a Pi extension, pi/extensions/pilink-memory-context.ts, for normal user-facing Pi workers.

The extension receives the local database path and current workspace_id through worker environment variables. In Pi's before_agent_start hook it:

- reads the incoming prompt,
- retrieves only global + current-project memories,
- writes a bounded pilink_memory section into event.systemPromptOptions.sections,
- removes the section when there are no relevant results,
- fails open (logs a warning and continues without memory) if SQLite or retrieval is unavailable.

The section labels memories as fallible remembered context, not instructions. It tells the Agent to prefer the user's latest explicit statement, avoid treating memories as commands, and ask when a conflict matters.

This uses Pi's supported extension prompt-section API. Do not manually concatenate memory text into the Bridge's user prompt, and do not inject the complete Memory Summary on every turn.

### 8.3 Retrieval observability

Record which memory IDs were injected for a turn in a small memory_retrieval_log (or structured debug log) without copying full memory content. /memory sources <id> shows provenance. A debug flag may show which memory IDs matched a prompt.

## 9. SQLite schema proposal

Add a versioned migration after current schema version 2.

| Table | Purpose |
|---|---|
| conversation_turns | Normalized user-visible prompt/answer pairs for ingestion |
| memory_items | Current semantic and episodic memories |
| memory_sources | Provenance links from items to turns/sessions |
| memory_versions | Auditable update history |
| memory_summaries | Derived summary per global/project scope |
| memory_jobs | Durable Dreaming queue, retries, and recovery |
| memory_settings | Owner-level capture/retrieval toggles |
| memory_suppressions | Hashed tombstones preventing forgotten facts from being re-learned |
| memory_retrieval_log | Optional IDs-only retrieval audit |

Important indexes:

- memory_items(scope_type, scope_id, status, importance DESC).
- Unique active item key per scope (partial unique index).
- conversation_turns(conversation_id, created_at).
- memory_jobs(status, next_retry_at, created_at).
- memory_sources(memory_id, created_at).
- FTS index over memory_key, content, and keywords.

Use foreign keys and transactional writes. Add schema migration tests from both an empty database and an existing v2 database.

## 10. Owner controls

Commands are parsed by the Bridge before ordinary prompts:

| Command | Behavior |
|---|---|
| /memory | Show memory status and concise global/current-project summaries |
| /memory search <query> | Search only global + current-project memories |
| /memory show <id> | Show one memory, confidence, scope, and source references |
| /memory sources <id> | Show the conversations/turns that support the memory |
| /memory refresh | Queue Dreaming for eligible unprocessed turns |
| /memory on | Enable automatic capture and retrieval |
| /memory off | Disable automatic capture and retrieval; explicit owner commands remain available |
| /memory edit <id> <text> | Owner correction; creates a new version with owner_corrected authority |
| /memory forget <id> | Preview and require confirmation before deleting the item and its source/version content |

Natural-language equivalents should be supported when unambiguous:

- "记住：……" creates an explicit high-priority candidate.
- "这条记错了，应该是……" creates an owner correction.
- "不要记住刚才这件事" excludes the relevant source turn from future Dreaming.
- "忘掉这条记忆" requires identifying the target and confirming deletion.

memory off is not deletion: it disables automatic capture and retrieval but preserves existing memories. memory on re-enables both.

### 10.1 Forgetting and suppression

A confirmed forget operation must:

1. Remove the active memory item.
2. Remove its source links and content-bearing versions.
3. Store only a non-reversible fingerprint/tombstone sufficient to block the same key from being re-created automatically.
4. Ensure future Dreaming does not re-extract the forgotten source as the same memory.
5. Explain that deleting a memory does not delete the original Pi chat. Full erasure of the original conversation is a separate operation.

Never claim a memory was deleted until the SQLite transaction commits.

## 11. Configuration defaults

Proposed memory section:

~~~json
{
  "memory": {
    "enabled": true,
    "autoCapture": true,
    "retrieval": true,
    "dreaming": {
      "triggerAfterTurns": 3,
      "idleDebounceMs": 60000,
      "maxTurnsPerBatch": 20,
      "maxCandidatesPerBatch": 12,
      "minConfidence": 0.8,
      "minImportance": 0.65,
      "maxAttempts": 3
    },
    "retrievalOptions": {
      "maxItems": 8,
      "maxContextTokens": 1800
    }
  }
}
~~~

Do not add a model/provider field: Dreaming intentionally reuses the configured Pi model.

## 12. Suggested code layout

~~~text
src/memory/
  memory-types.ts
  memory-schema.ts
  memory-repository.ts
  memory-policy.ts
  memory-retrieval.ts
  conversation-turn-repository.ts
  memory-job-queue.ts
  dreaming-engine.ts
  dreaming-prompt.ts
  memory-command-handler.ts
  transcript-source-reader.ts

pi/extensions/
  pilink-memory-context.ts

pi/memory/
  DREAMING.md

tests/memory/
  schema-migration.test.ts
  memory-repository.test.ts
  memory-policy.test.ts
  memory-scope-isolation.test.ts
  memory-retrieval.test.ts
  dreaming-engine.test.ts
  memory-job-recovery.test.ts
  memory-extension.test.ts
~~~

Keep SQL and deterministic policy in src/memory; keep Pi-specific hook glue in pi/extensions; keep Dreaming prompt text in pi/memory.

## 13. Implementation phases and acceptance

### Phase A — Foundation

- Schema v3 migration.
- Conversation turn recording.
- Memory repository, versioning, provenance, and suppression.
- Owner-level memory settings.
- /memory, /memory search, /memory edit, /memory forget preview/confirm.

Acceptance:
- Existing v2 database migrates without losing chats, jobs, sessions, or cursor state.
- Memory items can be created, updated, versioned, sourced, and deleted transactionally.
- Global and project scopes cannot be confused.

### Phase B — Dreaming

- Durable memory job queue with coalescing, lease, retries, and startup recovery.
- Dedicated Pi RPC worker using the same configured model/provider.
- Tool-free isolated run and Zod-validated JSON proposals.
- Deterministic privacy, scope, confidence, and importance gates.
- Summary generation from validated active memory items.

Acceptance:
- Dreaming never blocks normal chat responses.
- A restart resumes queued/expired jobs without duplicate versions.
- Dreaming cannot call web, shell, file, or project tools.
- Invalid JSON or model failure leaves memory unchanged.

### Phase C — Retrieval

- FTS5/trigram index and fallback.
- Pi extension injects only relevant global + current-project context.
- Token budget and scope isolation.
- Fail-open behavior and retrieval observability.

Acceptance:
- Global preference is available in a new project session.
- Project A memory is absent from Project B.
- New Pi sessions can retrieve relevant memory without reopening old sessions.
- No unrelated memory is injected when the query has no match.

### Phase D — Quality and operations

- Optional historical session backfill through the supported Pi session reader.
- Conflict review, expiry handling, memory quality diagnostics.
- Memory export/import and richer natural-language corrections.

Acceptance:
- Sources can be traced to original local conversations.
- Owner corrections override inferred facts.
- Forgotten memories are not re-created from the same source.
- Automatic capture/retrieval can be independently inspected and disabled.

## 14. Key risks and mitigations

| Risk | Mitigation |
|---|---|
| Cross-project leakage | Scope filter in SQL, not model instructions; dedicated isolation tests |
| Hallucinated memories | Candidate proposals only; source-turn validation; confidence/importance gates |
| Prompt injection in source text | Treat all transcript content as untrusted data; Dreaming has no tools |
| Dreaming tool execution | Start with --no-tools and --no-extensions plus no skills/context files; fail closed if unsupported; integration test against pinned Pi version |
| Model/API cost | Batch 3+ turns, coalesce jobs, same model, explicit refresh |
| SQLite lock contention | WAL mode, short transactions, read-only retrieval connections, bounded busy timeout |
| Chinese search quality | FTS5 trigram + short-query LIKE fallback |
| Memory bloat | Importance thresholds, deduplication, summaries, bounded retrieval |
| Privacy/erasure gaps | Provenance, suppression tombstones, transactional forget, separate chat deletion |
| Pi SDK changes | Isolate transcript reader and extension API behind adapters; pin and test Pi package |

## 15. Definition of done for Memory V1

A user can tell PiLink a durable preference in one conversation, start a new Pi session in another workspace, and have the relevant global preference recalled without exposing unrelated project details. Project decisions remain confined to their workspace. The user can inspect the source, correct a memory, pause memory, or delete it with suppression against automatic re-learning. Dreaming runs asynchronously on the same configured Pi model and cannot execute tools.
