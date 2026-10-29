package com.subspring.chatapp.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateDirectConversationRequest(@NotBlank String userId) {
}
