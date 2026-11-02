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

The smoke test starts the Pi CLI bundled with the pinned Pi package, creates a persistent test session under data/pi-sessions, sends one prompt, streams text deltas, and waits for agent_settled through RpcClient.

If your existing Pi installation is preferred, set PILINK_PI_CLI_PATH to its runnable CLI JavaScript entry. Set PI_CODING_AGENT_DIR to the existing Pi agent directory to reuse model and provider configuration.

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
