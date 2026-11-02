# PiLink

**Your local AI agent, anywhere.**

PiLink connects WeChat to a locally running [Pi](https://pi.dev) agent. Pi remains the only agent runtime: it owns reasoning, tool selection, execution, and session history. PiLink provides channel transport, conversation routing, task tracking, persistence, and policy enforcement.

> Status: early foundation / active development. The first milestone is a reliable local Pi RPC bridge. The WeChat iLink adapter and agent tools will be implemented incrementally; do not treat the current skeleton as a production-ready bot.

## Architecture

~~~text
WeChat
  |
Tencent iLink (QR auth, long polling, send/reply)
  |
Channel adapter
  |
PiLink Bridge
  |-- identity / allowlist
  |-- chat -> conversation -> Pi session routing
  |-- jobs / progress / approvals / outbox
  |-- SQLite persistence
  |
Pi RPC Supervisor
  |-- one worker per active Pi session
  |-- official @earendil-works/pi-coding-agent RpcClient
  |-- event normalization
  |
Pi Agent Runtime
  |-- existing model/provider configuration
  |-- Pi built-in tools, extensions and skills
  |-- Pi-owned JSONL session and compaction
  |
Local workspace / internet / browser / external APIs
~~~

## Design principles

1. **Pi is the only agent brain.** The bridge never calls an LLM or makes task-planning decisions.
2. **One logical conversation maps to one Pi session.** A WeChat chat can own multiple conversations.
3. **One active RPC worker owns a session at a time.** Never let multiple processes write the same Pi session file concurrently.
4. **Pi owns conversation history and compaction.** SQLite stores routing and operational metadata, not a duplicate transcript.
5. **Treat inbound content as untrusted.** Apply sender allowlists, workspace boundaries, approval policies, and URL/network guards.
6. **Ship in vertical slices.** A working RPC smoke test precedes the live WeChat integration.

## Requirements

- Node.js >= 22.19
- npm
- Pi installed and configured (pi --version, then configure a model with Pi)
- A Tencent WeChat iLink bot account for the future WeChat integration
- A Brave Search API key for web research (optional during the RPC milestone)

## Quick start

~~~bash
npm install
cp .env.example .env
cp config/config.example.json config/config.json
npm run typecheck
npm test
npm run dev -- doctor
~~~

Configure the Pi executable and agent directory in .env if they are not discoverable automatically. Never commit credentials.

## Commands

~~~bash
npm run dev -- doctor       # inspect local prerequisites
npm run dev -- pi:smoke     # start Pi RPC, send a prompt, wait for agent_settled
npm run build
npm start
~~~

The RPC smoke test is local-only. It does not require WeChat credentials.

## Repository layout

- src/pi: Pi RPC process and worker lifecycle
- src/bridge: routing, sessions, jobs, and event handling
- src/storage: SQLite schema and repositories
- src/channels/wechat: iLink channel boundary
- src/tools: reusable web-research tool implementations
- pi/extensions: extensions loaded by Pi
- pi/skills: reusable agent skills
- docs: architecture and implementation notes

## Security

Pi tools and extensions execute with the operating-system permissions of the Pi process. PiLink's allowlist and approval policy are defense-in-depth, not an OS sandbox. Run PiLink under a dedicated OS account or inside an appropriately restricted environment before enabling unattended file or shell operations. Do not expose Pi RPC over a network port.

## Roadmap

- [x] Repository and architecture foundation
- [ ] Pi RPC smoke test and worker lifecycle
- [ ] SQLite-backed conversation and job routing
- [ ] WeChat iLink QR login and text-message loop
- [ ] Brave search and source-aware web research
- [ ] File ingestion, workspace policy, and remote approvals
- [ ] Browser automation, memory, and scheduler

## License

TBD.
