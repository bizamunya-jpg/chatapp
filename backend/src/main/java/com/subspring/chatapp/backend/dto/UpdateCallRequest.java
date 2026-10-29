package com.subspring.chatapp.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record UpdateCallRequest(@NotBlank @Pattern(regexp = "ACCEPTED|DECLINED|ENDED") String status) {
}
