package com.subspring.chatapp.backend.dto;

import java.time.LocalDateTime;

import com.subspring.chatapp.backend.entities.Room;

public record RoomSummary(String id, String roomname, LocalDateTime createdAt) {
    public static RoomSummary from(Room room) {
        return new RoomSummary(room.getId(), room.getTitle(), room.getCreatedAt());
    }
}
