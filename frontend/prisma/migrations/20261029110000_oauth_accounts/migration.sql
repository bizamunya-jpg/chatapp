CREATE TABLE oauth_accounts (
    id text PRIMARY KEY,
    provider text NOT NULL,
    provider_subject text NOT NULL,
    user_id text NOT NULL,
    created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT oauth_accounts_provider_subject_key UNIQUE (provider, provider_subject),
    CONSTRAINT oauth_accounts_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES "User"(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX oauth_accounts_user_id_idx ON oauth_accounts (user_id);
