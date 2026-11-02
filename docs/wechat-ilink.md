# WeChat iLink integration notes

PiLink defines a channel-neutral adapter boundary. The transport is intentionally not implemented in this foundation commit.

Use Tencent's official implementation as the protocol reference:

- https://github.com/Tencent/openclaw-weixin
- https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol.md

The current protocol reference documents HTTPS JSON requests, QR login, getUpdates long polling, sendMessage, getConfig, sendTyping, and media upload/download.

Important implementation requirements:

1. Persist get_updates_buf only after a successful response.
2. Deduplicate inbound messages using chat identity and message_id.
3. Keep context_token separate from Pi conversation/session identifiers.
4. Reply using the context_token from the corresponding inbound conversation.
5. Handle HTTP status and application return codes separately.
6. Apply retry/backoff by operation; redact bot tokens, context tokens, and media keys from logs.
7. Implement media decryption only from the official implementation and add fixture-based tests.
8. Do not infer group-chat support merely from optional group_id fields in protocol types.

The protocol document is based on the current client implementation and explicitly warns that it is not a complete server contract. Pin and test the adapter against a known upstream version.
