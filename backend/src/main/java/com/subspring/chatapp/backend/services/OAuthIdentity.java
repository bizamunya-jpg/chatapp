package com.subspring.chatapp.backend.services;

public record OAuthIdentity(
        String provider,
        String subject,
        String email,
        String displayName,
        String username
) {
}
