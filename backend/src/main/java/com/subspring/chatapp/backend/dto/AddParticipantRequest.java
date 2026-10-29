package com.subspring.chatapp.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record AddParticipantRequest(@NotBlank String userId) {
}
