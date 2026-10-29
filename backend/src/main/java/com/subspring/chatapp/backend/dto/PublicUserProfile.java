package com.subspring.chatapp.backend.dto;

import com.subspring.chatapp.backend.entities.User;

public record PublicUserProfile(String id, String username, String displayName, String avatarUrl) {

    public static PublicUserProfile from(User user) {
        return new PublicUserProfile(
                user.getId(),
                user.getUsername(),
                user.getName(),
                UserProfile.avatarUrl(user)
        );
    }
}
