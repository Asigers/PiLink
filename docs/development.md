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

Configure local paths in config/config.json or .env. WeChat credentials are stored separately under data/wechat/credentials.json and must never be committed.

## Link personal WeChat

~~~bash
npm run dev -- login
~~~

Scan the QR code using the personal WeChat account that owns the ClawBot. The iLink ilink_user_id returned after confirmation becomes the only accepted sender. Credentials are written atomically with POSIX mode 0600. PiLink does not encrypt the credential file; rely on the local OS account and disk security.

To replace the linked account:

~~~bash
npm run dev -- logout
npm run dev -- login
~~~

## Run

~~~bash
npm run dev -- doctor
npm run dev -- status
npm run dev -- start
~~~

The transport calls iLink notifyStart, long-polls getUpdates, stores the get_updates_buf cursor after each successfully dispatched batch, and calls notifyStop during shutdown. Message IDs are stored before dispatch and marked processed only after the Bridge accepts the message. If dispatch fails, the cursor is not advanced and the message is retried.

Only direct messages from the QR-login owner are routed. Text and voice items with a server-provided transcript are supported. Group messages and non-text media are skipped or receive a text-only capability notice.

## WeChat commands

- /new: create a separate Pi conversation.
- /status: show the current task and queued count.
- /stop: abort the active run and cancel queued tasks for the active conversation.
- /help: list commands.

Normal text is queued per conversation. The Bridge acknowledges receipt, runs the Pi prompt in the background, and sends the final response when Pi settles.

## Verify Pi RPC

~~~bash
npm run dev -- pi:smoke
~~~

Run the same command again to verify that Pi resumes the existing conversation after the previous RPC process has exited.

## Current limitations

- Real QR login and live iLink message exchange must be verified on the target Mac.
- Media download/decryption, image/file/video messages, and raw voice decoding are not implemented.
- Replies are sent after the Agent completes; token-by-token streaming and typing indicators are not implemented.
- Outbound messages are not yet stored in a durable retry outbox.
- Running jobs are not recovered after a PiLink process crash.
- PiLink's owner check is not an OS sandbox; Pi tools execute with the PiLink process permissions.
