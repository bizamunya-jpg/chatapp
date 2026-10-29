package com.subspring.chatapp.backend.dto;

import com.subspring.chatapp.backend.entities.User;

public record UserProfile(String id, String username, String email, String displayName, String avatarUrl) {

    public static UserProfile from(User user) {
        return new UserProfile(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getName(),
                avatarUrl(user)
        );
    }

    public static String avatarUrl(User user) {
        return user.getAvatarStorageKey() == null
                ? null
                : "/api/v1/users/" + user.getId() + "/avatar?v=" + user.getUpdatedAt();
    }
}
