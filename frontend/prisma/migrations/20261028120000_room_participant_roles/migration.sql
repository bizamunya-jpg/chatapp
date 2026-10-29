ALTER TABLE conversation_participants
    ADD COLUMN role text NOT NULL DEFAULT 'PARTICIPANT';
