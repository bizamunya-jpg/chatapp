package com.subspring.chatapp.backend.dto;

public record CallNotification(
        String callId,
        String conversationId,
        String initiatorId,
        String recipientId,
        String status
) {
}
