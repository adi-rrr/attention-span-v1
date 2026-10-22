-- Dev seed user for x-user-id header stub
-- id must match EXPO_PUBLIC_DEV_USER_ID / apps/mobile default

INSERT INTO users (id, auth_provider_id, email, display_name, timezone)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'dev_local',
  'dev@attentionspan.local',
  'Dev User',
  'Asia/Kolkata'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_settings (user_id)
VALUES ('00000000-0000-4000-8000-000000000001')
ON CONFLICT (user_id) DO NOTHING;
