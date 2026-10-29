ALTER TABLE "Conversation"
    ADD COLUMN owner_id text;

CREATE INDEX "Conversation_owner_id_idx" ON "Conversation"(owner_id);

ALTER TABLE "Conversation"
    ADD CONSTRAINT "Conversation_owner_id_fkey"
    FOREIGN KEY (owner_id) REFERENCES "User"(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE room_join_requests (
    id text PRIMARY KEY,
    room_id text NOT NULL REFERENCES "Conversation"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    user_id text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    status text NOT NULL DEFAULT 'PENDING',
    created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamp(3)
);

CREATE INDEX room_join_requests_room_id_status_created_at_idx
    ON room_join_requests(room_id, status, created_at);
CREATE INDEX room_join_requests_user_id_idx
    ON room_join_requests(user_id);
CREATE UNIQUE INDEX room_join_requests_one_pending_per_user_key
    ON room_join_requests(room_id, user_id)
    WHERE status = 'PENDING';

CREATE TABLE room_invitations (
    id text PRIMARY KEY,
    room_id text NOT NULL REFERENCES "Conversation"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    inviter_id text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    invitee_id text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    status text NOT NULL DEFAULT 'PENDING',
    created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamp(3)
);

CREATE INDEX room_invitations_room_id_status_created_at_idx
    ON room_invitations(room_id, status, created_at);
CREATE INDEX room_invitations_invitee_id_status_created_at_idx
    ON room_invitations(invitee_id, status, created_at);
CREATE UNIQUE INDEX room_invitations_one_pending_per_invitee_key
    ON room_invitations(room_id, invitee_id)
    WHERE status = 'PENDING';
