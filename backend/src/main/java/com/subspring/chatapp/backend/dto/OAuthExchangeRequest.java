package com.subspring.chatapp.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record OAuthExchangeRequest(
        @NotBlank @Pattern(regexp = "google|github") String provider,
        @NotBlank @Size(max = 8192) String accessToken
) {
}
