package com.subspring.chatapp.backend.dto;

public record CallSignalRequest(String callId, String type, String payload) {
}
