CREATE TABLE IF NOT EXISTS call_participants (
    call_id text NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'RINGING',
    joined_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at timestamp(3),
    PRIMARY KEY (call_id, user_id)
);

CREATE INDEX IF NOT EXISTS "call_participants_user_id_status_idx"
    ON call_participants (user_id, status);
