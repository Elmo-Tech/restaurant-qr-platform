-- Preserve any administrator-selected destination; replace only the former default.
UPDATE "platform_public_settings"
SET "powered_by_url" = 'https://waytaapp.com/', "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'public' AND "powered_by_url" = 'https://menu.elmotechsoft.online/';
