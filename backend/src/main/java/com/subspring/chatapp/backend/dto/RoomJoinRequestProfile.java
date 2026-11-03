package com.subspring.chatapp.backend.dto;

import java.time.LocalDateTime;

public record RoomJoinRequestProfile(
        String id,
        String roomId,
        String userId,
        String username,
        String displayName,
        String avatarUrl,
        String status,
        LocalDateTime createdAt
) {
}
