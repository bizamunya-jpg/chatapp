package com.subspring.chatapp.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank
        @Pattern(regexp = "^[a-zA-Z0-9_.-]{3,32}$")
        String username,
        @NotBlank @Email @Size(max = 254)
        String email,
        @NotBlank @Size(min = 8, max = 72)
        String password,
        @Size(max = 80)
        String displayName
) {
}
