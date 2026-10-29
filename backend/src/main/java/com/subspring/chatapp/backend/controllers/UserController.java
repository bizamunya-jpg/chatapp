package com.subspring.chatapp.backend.controllers;
import java.util.List;

import com.subspring.chatapp.backend.dto.PublicUserProfile;
import com.subspring.chatapp.backend.dto.UpdateProfileRequest;
import com.subspring.chatapp.backend.dto.UserProfile;
import com.subspring.chatapp.backend.entities.User;
import com.subspring.chatapp.backend.repositories.UserRepository;
import jakarta.validation.Valid;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {
    private final UserRepository userRepository;

    public UserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfile> currentUser(@AuthenticationPrincipal Jwt jwt) {
        return userRepository.findById(jwt.getSubject())
                .map(UserProfile::from)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
    }

    @PatchMapping("/me")
    public ResponseEntity<UserProfile> updateCurrentUser(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody UpdateProfileRequest request
    ) {
        return userRepository.findById(jwt.getSubject())
                .map(user -> {
                    user.setName(request.displayName().trim());
                    return ResponseEntity.ok(UserProfile.from(userRepository.save(user)));
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
    }

    @GetMapping
    public List<PublicUserProfile> searchUsers(
            @RequestParam(name = "query", defaultValue = "") String query
    ) {
        String normalizedQuery = query.trim();
        if (normalizedQuery.length() < 2) {
            return List.of();
        }
        return userRepository.findByUsernameContainingIgnoreCaseOrNameContainingIgnoreCase(
                        normalizedQuery,
                        normalizedQuery,
                        PageRequest.of(0, 20)
                )
                .stream()
                .map(PublicUserProfile::from)
                .toList();
    }
}
