ALTER TABLE attachments
    DROP CONSTRAINT IF EXISTS attachments_message_id_fkey,
    ADD CONSTRAINT attachments_message_id_fkey
        FOREIGN KEY (message_id) REFERENCES messages(id)
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE calls
    DROP CONSTRAINT IF EXISTS calls_conversation_id_fkey,
    ADD CONSTRAINT calls_conversation_id_fkey
        FOREIGN KEY (conversation_id) REFERENCES "Conversation"(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    DROP CONSTRAINT IF EXISTS calls_initiator_id_fkey,
    ADD CONSTRAINT calls_initiator_id_fkey
        FOREIGN KEY (initiator_id) REFERENCES "User"(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    DROP CONSTRAINT IF EXISTS calls_recipient_id_fkey,
    ADD CONSTRAINT calls_recipient_id_fkey
        FOREIGN KEY (recipient_id) REFERENCES "User"(id)
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE refresh_tokens
    DROP CONSTRAINT IF EXISTS refresh_tokens_user_id_fkey,
    ADD CONSTRAINT refresh_tokens_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES "User"(id)
        ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION release_conversation_title()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.title IS NOT NULL THEN
        IF TG_OP = 'DELETE' THEN
            IF NOT EXISTS (SELECT 1 FROM "Conversation" WHERE title = OLD.title) THEN
                DELETE FROM conversation_title_reservations WHERE title = OLD.title;
            END IF;
        ELSIF NEW.title IS DISTINCT FROM OLD.title
              AND NOT EXISTS (SELECT 1 FROM "Conversation" WHERE title = OLD.title) THEN
            DELETE FROM conversation_title_reservations WHERE title = OLD.title;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
