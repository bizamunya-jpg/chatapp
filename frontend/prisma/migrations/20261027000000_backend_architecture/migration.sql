ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS username text,
    ADD COLUMN IF NOT EXISTS password_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User" (username);

ALTER TABLE "Conversation"
    ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'GROUP',
    ADD COLUMN IF NOT EXISTS direct_key text;

CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_direct_key_key" ON "Conversation" (direct_key);

CREATE TABLE IF NOT EXISTS conversation_title_reservations (
    title text PRIMARY KEY
);
INSERT INTO conversation_title_reservations (title)
SELECT DISTINCT title
FROM "Conversation"
WHERE title IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION reserve_conversation_title()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.title IS NOT DISTINCT FROM OLD.title THEN
        RETURN NEW;
    END IF;

    IF NEW.title IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO conversation_title_reservations (title)
    VALUES (NEW.title)
    ON CONFLICT DO NOTHING;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'A conversation with this title already exists'
            USING ERRCODE = '23505', CONSTRAINT = 'Conversation_title_key';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION release_conversation_title()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.title IS NOT NULL
       AND (TG_OP = 'DELETE' OR NEW.title IS DISTINCT FROM OLD.title)
       AND NOT EXISTS (SELECT 1 FROM "Conversation" WHERE title = OLD.title) THEN
        DELETE FROM conversation_title_reservations WHERE title = OLD.title;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversation_title_reservation_trigger ON "Conversation";
CREATE TRIGGER conversation_title_reservation_trigger
    BEFORE INSERT OR UPDATE OF title ON "Conversation"
    FOR EACH ROW EXECUTE FUNCTION reserve_conversation_title();

DROP TRIGGER IF EXISTS conversation_title_release_trigger ON "Conversation";
CREATE TRIGGER conversation_title_release_trigger
    AFTER DELETE OR UPDATE OF title ON "Conversation"
    FOR EACH ROW EXECUTE FUNCTION release_conversation_title();

ALTER TABLE conversation_participants
    ADD COLUMN IF NOT EXISTS last_read_message_id text;

ALTER TABLE messages
    ALTER COLUMN content DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS client_message_id text,
    ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'TEXT',
    ADD COLUMN IF NOT EXISTS edited_at timestamp(3),
    ADD COLUMN IF NOT EXISTS deleted_at timestamp(3);

CREATE UNIQUE INDEX IF NOT EXISTS "messages_conversation_id_sender_id_client_message_id_key"
    ON messages (conversation_id, sender_id, client_message_id);
CREATE INDEX IF NOT EXISTS "messages_sender_id_idx" ON messages (sender_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamp(3) NOT NULL,
    revoked_at timestamp(3),
    created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_id_idx" ON refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS attachments (
    id text PRIMARY KEY,
    message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    storage_key text NOT NULL UNIQUE,
    original_filename text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "attachments_message_id_idx" ON attachments (message_id);

CREATE TABLE IF NOT EXISTS calls (
    id text PRIMARY KEY,
    conversation_id text NOT NULL REFERENCES "Conversation"(id) ON DELETE CASCADE,
    initiator_id text NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
    recipient_id text NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'RINGING',
    started_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at timestamp(3)
);
CREATE INDEX IF NOT EXISTS "calls_conversation_id_status_idx" ON calls (conversation_id, status);
