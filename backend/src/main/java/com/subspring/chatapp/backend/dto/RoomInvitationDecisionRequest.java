package com.subspring.chatapp.backend.dto;

import jakarta.validation.constraints.NotNull;

public record RoomInvitationDecisionRequest(@NotNull Boolean accepted) {
}
