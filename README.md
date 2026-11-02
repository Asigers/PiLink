# PiLink

**Your local Pi Agent, controlled from your personal WeChat.**

PiLink connects one personal WeChat ClawBot to one local Pi Agent. Pi is the only agent runtime: it owns model inference, reasoning, tool selection, execution, and the conversation transcript. PiLink implements the iLink transport, message routing, task lifecycle, and local state.

> Status: Milestone 1 implementation is in place. A real QR login and end-to-end message exchange still need to be verified on the target Mac with the owner's WeChat account.

## Architecture

~~~text
Your personal WeChat
  |
Tencent iLink (QR login, long polling, send/reply)
  |
PiLink WeChat adapter
  |-- one linked Bot account
  |-- owner-only direct-message filter
  |-- durable update cursor + inbound deduplication
  |-- context_token-aware replies
  |
PiLink Bridge
  |-- one personal chat
  |-- /new /status /stop /help
  |-- queued jobs and completion notifications
  |-- SQLite state
  |
Pi RPC Worker Pool
  |-- one active worker per Pi session
  |-- official @earendil-works/pi-coding-agent RpcClient
  |
Pi Agent Runtime
  |-- your existing model/provider configuration
  |-- Pi tools, extensions and skills
  |-- Pi-owned JSONL sessions and compaction
~~~

## Design principles

1. **Single-person product.** One PiLink instance is linked to one personal WeChat owner. No multi-user directory, tenant model, group chat, or sender allowlist.
2. **Owner check at the channel boundary.** The ilink_user_id returned by QR login is the sole authorized sender. Only direct messages from that owner are dispatched.
3. **Pi is the only Agent brain.** The bridge never calls an LLM or makes task-planning decisions.
4. **One default personal conversation.** All ordinary messages continue the active Pi session. /new creates another independent Pi conversation.
5. **Pi owns context.** Pi owns the JSONL transcript and compaction. SQLite stores routing, job, cursor, and message-deduplication metadata.
6. **One active RPC writer per session.** Never let multiple processes write the same Pi session file concurrently.
7. **Treat external content as untrusted.** Pi tools run with the operating-system permissions of the PiLink process; this is not an OS sandbox.

## Requirements

- Node.js >= 22.19
- npm
- Pi installed and configured with a working model
- A personal WeChat account with access to the ClawBot/iLink QR flow
- A Brave Search API key for web research (optional)

## Quick start

~~~bash
npm install
cp .env.example .env
cp config/config.example.json config/config.json
npm run typecheck
npm test
npm run dev -- doctor
~~~

Configure Pi paths in .env if needed. Never commit credentials.

## Link your personal WeChat

~~~bash
npm run dev -- login
~~~

Scan the terminal QR code with your own WeChat account and confirm the login. The resulting Bot token is stored in data/wechat/credentials.json with owner-only file permissions (0600 on POSIX systems). This file is ignored by Git. The token is stored locally as a credential file; it is not encrypted by PiLink.

To replace the linked account, run npm run dev -- logout and then log in again, or use npm run dev -- login --force.

## Start PiLink

~~~bash
npm run dev -- start
~~~

Or build and run:

~~~bash
npm run build
npm start
~~~

PiLink long-polls iLink, accepts only the QR-login owner's direct messages, routes text and WeChat-transcribed voice text to Pi, and sends the final answer back using the inbound context_token.

## WeChat commands

| Command | Purpose |
|---|---|
| /new | Create a new independent Pi conversation |
| /status | Show the active task and queued task count |
| /stop | Abort the active task and clear queued tasks in the current conversation |
| /help | Show commands |

Ordinary text messages continue the currently active conversation. Creating a new conversation does not erase older Pi session files.

## Local commands

~~~bash
npm run dev -- doctor
npm run dev -- status
npm run dev -- login
npm run dev -- logout
npm run dev -- start
npm run dev -- pi:smoke
npm run build
npm test
~~~

The default smoke-test session ID is pilink_smoke; repeating the smoke test resumes the same Pi session. The RPC smoke test is local-only and does not require WeChat credentials.

## Current scope and limitations

- Text messages and voice messages with an iLink-provided transcript are supported.
- Images, files, videos, raw voice decoding, and group chats are not supported in this milestone.
- Replies are sent as complete messages after Pi finishes; token-by-token streaming is not implemented.
- Long-running tasks send an acknowledgement and a final result. Durable outbound retry/outbox delivery is not yet implemented.
- A stale iLink token stops the transport; run pilink login again.
- The protocol implementation follows Tencent's public openclaw-weixin protocol reference: https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol.md. That document is derived from the client implementation and is not a complete server contract.

## Security

The iLink token is a bearer credential. Keep the credentials file private and run PiLink under your own OS account. PiLink checks the owner ID from QR login before dispatching a message, but Pi tools/extensions execute with the OS permissions of the PiLink process. Use a dedicated OS account or sandbox before enabling unattended destructive operations. Do not expose Pi RPC over a network port.

## Repository layout

- src/pi: Pi RPC process and worker lifecycle
- src/bridge: personal chat routing, jobs, and commands
- src/storage: SQLite schema and repositories
- src/channels/wechat: QR login, iLink API, credentials, transport, and inbound state
- src/tools: reusable web-research tools
- pi/extensions: extensions loaded by Pi
- pi/skills: reusable agent skills
- docs: architecture, protocol notes, and development guide

## Roadmap

- [x] Pi RPC worker lifecycle and persistent smoke-test harness
- [x] Single-owner WeChat QR login and local credential storage
- [x] iLink long polling, cursor persistence, and inbound message deduplication
- [x] Owner-only direct-message routing and context-token-aware replies
- [x] Pi RPC task queue and /new, /status, /stop, /help
- [ ] Real QR login and end-to-end acceptance on the target Mac
- [ ] Durable outbound outbox and restart recovery for running jobs
- [ ] Browser automation, attachment ingestion, curated memory, and scheduler

## License

TBD.
