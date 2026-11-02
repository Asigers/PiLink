# WeChat iLink integration

PiLink implements the personal-account text subset of Tencent's iLink protocol. It does not embed OpenClaw or reuse its runtime. Protocol reference: https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol.md.

The upstream protocol document is derived from the openclaw-weixin client implementation and explicitly does not claim to be a complete server contract. PiLink therefore keeps the transport isolated and covers request shapes with fixture-based tests.

## Supported flow

1. Run npm run dev -- login.
2. Request a QR code from POST /ilink/bot/get_bot_qrcode?bot_type=3.
3. Poll GET /ilink/bot/get_qrcode_status, handle scaned, need_verifycode, expired, scaned_but_redirect, and confirmed.
4. Store bot_token, ilink_bot_id, ilink_user_id, and baseurl in the local credentials file.
5. Run npm run dev -- start.
6. Notify iLink with POST /ilink/bot/msg/notifystart.
7. Long-poll POST /ilink/bot/getupdates with the persisted get_updates_buf.
8. Accept only message_type=1 direct messages where from_user_id equals the QR-login ilink_user_id.
9. Extract text_item or a server-provided voice_item.text transcript and dispatch to Pi.
10. Reply with POST /ilink/bot/sendmessage, preserving the inbound context_token.
11. On shutdown, abort long polling and call POST /ilink/bot/msg/notifystop.

## Authentication headers

Authenticated bot POST requests include:

- Content-Type: application/json
- AuthorizationType: ilink_bot_token
- Authorization: Bearer <bot_token>
- X-WECHAT-UIN: base64 of a random uint32 represented as decimal text
- iLink-App-Id: bot
- iLink-App-ClientVersion: PiLink's semantic version encoded as 0x00MMNNPP and sent as decimal text
- base_info with channel_version and bot_agent

QR-code status GET requests use the common iLink application headers but do not include bot Authorization. The QR-code POST includes AuthorizationType and X-WECHAT-UIN but no Authorization and no base_info.

## State and retry behavior

- The poll cursor is stored in SQLite channel_state.
- Inbound message IDs are stored in inbound_messages with received/processed status.
- A message is marked processed only after the Bridge accepts it.
- The cursor advances only after all messages in the returned batch have been handled or safely skipped.
- If dispatch fails, the cursor is not advanced. Previously processed messages are deduplicated on the next poll; received-but-unprocessed messages are retried.
- iLink error code -14 is treated as an expired Bot session and stops the transport. Re-run QR login.
- Transient poll errors retry after two seconds; after three consecutive failures the transport backs off for thirty seconds.
- Long-poll timeout is bounded between five and sixty seconds using the server-suggested timeout.

## Personal-account boundary

The owner ID returned from QR login is the only accepted sender. Group messages and other sender IDs are ignored. This is intentionally a single-user design; there is no general user directory, tenant mapping, or allowlist configuration.

The inbound context_token is a WeChat reply credential. It is stored separately from the Pi session ID and passed back on outbound replies. Pi's JSONL session remains the source of truth for Agent context.

## Current limitations

- Text and voice messages with a server-provided transcript are supported.
- Images, files, videos, raw voice decoding, media upload/download, typing indicators, and group chats are not supported.
- Replies are sent after the Agent completes; token-by-token streaming is not implemented.
- Outbound delivery does not yet have a durable retry outbox.
- The credentials file is protected with owner-only POSIX file permissions but is not encrypted by PiLink.
