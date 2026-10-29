package com.subspring.chatapp.backend.dto;

import com.subspring.chatapp.backend.entities.RoomRole;
import jakarta.validation.constraints.NotNull;

public record UpdateRoomParticipantRoleRequest(@NotNull RoomRole role) {
}
