package com.subspring.chatapp.backend.dto;

import com.subspring.chatapp.backend.entities.RoomRole;

public record RoomParticipantProfile(String id, String username, String displayName, RoomRole role) {
}
