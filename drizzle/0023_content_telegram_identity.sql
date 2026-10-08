ALTER TABLE content_entries ADD CONSTRAINT content_entries_telegram_valid CHECK (
  kind <> 'article' OR NOT (payload ?| ARRAY['telegramPostId','telegramSourceUrl','contentOrigin']) OR COALESCE(
    jsonb_typeof(payload->'telegramPostId') = 'string' AND payload->>'telegramPostId' ~ '^[1-9][0-9]*$'
    AND payload->>'telegramSourceUrl' = 'https://t.me/korotkovsStudio/' || (payload->>'telegramPostId')
    AND payload->>'contentOrigin' = 'telegram:korotkovsStudio', false)
);
--> statement-breakpoint
CREATE UNIQUE INDEX content_entries_telegram_post_uq ON content_entries ((payload->>'telegramPostId')) WHERE kind = 'article' AND payload ? 'telegramPostId';
--> statement-breakpoint
CREATE UNIQUE INDEX content_entries_telegram_url_uq ON content_entries ((payload->>'telegramSourceUrl')) WHERE kind = 'article' AND payload ? 'telegramSourceUrl';
