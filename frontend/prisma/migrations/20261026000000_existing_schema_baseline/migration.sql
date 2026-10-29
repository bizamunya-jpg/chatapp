-- Baseline of the pre-existing PostgreSQL schema. Existing databases must
-- mark this migration as applied; new databases can create these objects.
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "public"."Conversation" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."conversation_participants" (
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id", "user_id")
);

CREATE TABLE "public"."messages" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Conversation_updatedAt_idx" ON "public"."Conversation"("updatedAt" ASC);
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);
CREATE INDEX "conversation_participants_user_id_idx" ON "public"."conversation_participants"("user_id" ASC);
CREATE INDEX "messages_conversation_id_createdAt_idx"
    ON "public"."messages"("conversation_id" ASC, "createdAt" ASC);
CREATE INDEX "messages_sender_id_idx" ON "public"."messages"("sender_id" ASC);

ALTER TABLE "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "public"."Conversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "public"."Conversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey"
    FOREIGN KEY ("sender_id") REFERENCES "public"."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
