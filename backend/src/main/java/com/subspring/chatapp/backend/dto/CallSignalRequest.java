package com.subspring.chatapp.backend.dto;

public record CallSignalRequest(String callId, String toUserId, String type, String payload) {
}
