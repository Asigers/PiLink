# Development

## Requirements

- Node.js 22.19 or newer
- npm
- Pi installed and a model configured
- macOS, Linux, or Windows

## Setup

~~~bash
npm install
cp .env.example .env
cp config/config.example.json config/config.json
npm run typecheck
npm test
~~~

Edit config/config.json for local paths. Keep credentials in environment variables or a local secret store; never commit them.

## Verify Pi RPC

~~~bash
npm run dev -- doctor
npm run dev -- pi:smoke
~~~

The smoke test starts the Pi CLI bundled with the pinned Pi package, creates or resumes the persistent `pilink_smoke` session under `data/pi-sessions`, sends one prompt, streams text deltas, and waits for Pi's `agent_settled` event. It then checks the session ID, message-count advancement, and final assistant response.

Run the same command a second time to verify that Pi resumes the existing conversation after the previous RPC process has exited. For an explicit session:

~~~bash
npm run dev -- pi:smoke --session-id my-smoke "Continue the same smoke-test conversation."
~~~

For a clean, isolated session:

~~~bash
npm run dev -- pi:smoke --new-session "Reply with a short readiness confirmation."
~~~

You can also set `PILINK_SMOKE_SESSION_ID` in `.env` to choose the default persistent smoke session ID. Session IDs are limited to letters, numbers, dots, underscores, and hyphens.

If your existing Pi installation is preferred, set `PILINK_PI_CLI_PATH` to its runnable CLI JavaScript entry. Set `PI_CODING_AGENT_DIR` to the existing Pi agent directory to reuse model and provider configuration.

## Development commands

~~~bash
npm run dev -- help
npm run build
npm start
npm test
~~~

## Current limitations

- WeChat adapter is an interface boundary only; QR login and network transport are not implemented yet.
- MessageRouter is an application service, not yet wired to a running channel.
- Remote approval is a policy design target, not an enforcement guarantee in this commit.
- Brave Search requires BRAVE_SEARCH_API_KEY.
- Playwright, media ingestion, scheduling, and long-term memory are not implemented yet.
