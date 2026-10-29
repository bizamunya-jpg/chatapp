package com.subspring.chatapp.backend.dto;

import com.subspring.chatapp.backend.entities.User;

public record UserProfile(String id, String username, String email, String displayName) {

    public static UserProfile from(User user) {
        return new UserProfile(user.getId(), user.getUsername(), user.getEmail(), user.getName());
    }
}
