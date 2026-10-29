package com.subspring.chatapp.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateMessageRequest(
        @NotBlank @Size(max = 4000) String content,
        @Size(max = 100) String clientMessageId
) {
}
