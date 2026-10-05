-- Notification templates are retired (decisions/siaran-pengumuman.md, 6):
-- nothing has sent from them since broadcasting became Pengumuman, and their
-- pages and routes are gone. They lived as one settings row per unit.
BEGIN;

DELETE FROM "settings" WHERE "key" = 'NOTIFICATION_TEMPLATES';

COMMIT;
