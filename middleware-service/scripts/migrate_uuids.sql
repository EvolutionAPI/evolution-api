-- Migration: Convert all middleware tables from INTEGER to UUID primary/foreign keys
-- Drops old tables entirely since the schema changed (removed columns: external_customer_id, source_instance, channel)
-- New tables with UUID columns are created on next app startup via Base.metadata.create_all()

BEGIN;

-- Drop FK constraints first
ALTER TABLE IF EXISTS tickets           DROP CONSTRAINT IF EXISTS tickets_customer_id_fkey;
ALTER TABLE IF EXISTS tickets           DROP CONSTRAINT IF EXISTS tickets_tenant_id_fkey;
ALTER TABLE IF EXISTS command_logs      DROP CONSTRAINT IF EXISTS command_logs_ticket_id_fkey;
ALTER TABLE IF EXISTS ticket_comments   DROP CONSTRAINT IF EXISTS ticket_comments_ticket_id_fkey;
ALTER TABLE IF EXISTS ticket_messages   DROP CONSTRAINT IF EXISTS ticket_messages_ticket_id_fkey;
ALTER TABLE IF EXISTS instance_tenants  DROP CONSTRAINT IF EXISTS instance_tenants_tenant_id_fkey;
ALTER TABLE IF EXISTS whatsapp_sessions DROP CONSTRAINT IF EXISTS whatsapp_sessions_tenant_id_fkey;

-- Drop all tables (order matters for CASCADE safety, but FKs are already dropped)
DROP TABLE IF EXISTS command_logs      CASCADE;
DROP TABLE IF EXISTS ticket_comments   CASCADE;
DROP TABLE IF EXISTS ticket_messages   CASCADE;
DROP TABLE IF EXISTS tickets           CASCADE;
DROP TABLE IF EXISTS customers         CASCADE;
DROP TABLE IF EXISTS whatsapp_sessions CASCADE;
DROP TABLE IF EXISTS instance_tenants  CASCADE;
DROP TABLE IF EXISTS event_logs        CASCADE;
DROP TABLE IF EXISTS tenants           CASCADE;

COMMIT;
