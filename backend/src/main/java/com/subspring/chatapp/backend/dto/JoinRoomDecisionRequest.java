package com.subspring.chatapp.backend.dto;

import jakarta.validation.constraints.NotNull;

public record JoinRoomDecisionRequest(@NotNull Boolean approved) {
}
