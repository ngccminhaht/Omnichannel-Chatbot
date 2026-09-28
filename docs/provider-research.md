# Provider research notes

## Meta Messenger

The official Messenger Send API flow uses a Page access token and the `pages_messaging` permission. The recipient generally needs to have messaged the Page within Meta's standard messaging window, so outbound delivery must model provider rejection and policy errors rather than assuming every message is sendable.

The integration must pin a Graph API version and keep the version in configuration because Meta publishes versioned changelogs and sunset dates. Provider code therefore lives behind an adapter and must expose provider error codes.

Sources:

- https://developers.facebook.com/docs/messenger-platform/send-messages
- https://developers.facebook.com/docs/messenger-platform/webhooks
- https://developers.meta.com/blog/

## Zalo OA

Zalo exposes Official Account OpenAPI and webhook capabilities. Its identity, token, payload and message rules are not interchangeable with Meta, so Zalo stays a separate adapter implementing the canonical contract.

Source:

- https://developers.zalo.me/docs
