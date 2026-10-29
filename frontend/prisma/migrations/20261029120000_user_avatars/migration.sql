ALTER TABLE "User"
    ADD COLUMN "avatar_storage_key" text,
    ADD COLUMN "avatar_mime_type" text;

CREATE UNIQUE INDEX "User_avatar_storage_key_key" ON "User"("avatar_storage_key");
