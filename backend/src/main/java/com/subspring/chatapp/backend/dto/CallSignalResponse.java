package com.subspring.chatapp.backend.dto;

public record CallSignalResponse(String callId, String fromUserId, String type, String payload) {
}
