package com.subspring.chatapp.backend.controllers;
import java.util.List;
import java.util.Set;

import com.subspring.chatapp.backend.dto.PublicUserProfile;
import com.subspring.chatapp.backend.dto.UpdateProfileRequest;
import com.subspring.chatapp.backend.dto.UserProfile;
import com.subspring.chatapp.backend.entities.User;
import com.subspring.chatapp.backend.repositories.UserRepository;
import com.subspring.chatapp.backend.services.AttachmentStorageService;
import com.subspring.chatapp.backend.services.AttachmentStorageService.StoredFile;
import jakarta.validation.Valid;
import org.springframework.data.domain.PageRequest;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {
    private static final long MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
    private static final Set<String> ALLOWED_AVATAR_TYPES =
            Set.of("image/jpeg", "image/png", "image/gif", "image/webp");
    private final UserRepository userRepository;
    private final AttachmentStorageService storageService;

    public UserController(UserRepository userRepository, AttachmentStorageService storageService) {
        this.userRepository = userRepository;
        this.storageService = storageService;
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

    @PostMapping(path = "/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<UserProfile> uploadAvatar(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam("file") MultipartFile upload
    ) {
        if (upload == null || upload.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose an image to upload.");
        }
        if (upload.getSize() > MAX_AVATAR_SIZE_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Profile images must be 2 MB or smaller.");
        }
        if (!ALLOWED_AVATAR_TYPES.contains(upload.getContentType())) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Choose a JPG, PNG, GIF, or WebP image.");
        }

        User user = userRepository.findById(jwt.getSubject())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        StoredFile storedFile = storageService.store(upload);
        String previousStorageKey = user.getAvatarStorageKey();
        user.setAvatarStorageKey(storedFile.storageKey());
        user.setAvatarMimeType(storedFile.contentType());
        User savedUser;
        try {
            savedUser = userRepository.saveAndFlush(user);
        } catch (RuntimeException exception) {
            storageService.delete(storedFile.storageKey());
            throw exception;
        }
        if (previousStorageKey != null) {
            storageService.delete(previousStorageKey);
        }
        return ResponseEntity.ok(UserProfile.from(savedUser));
    }

    @DeleteMapping("/me/avatar")
    public ResponseEntity<Void> deleteAvatar(@AuthenticationPrincipal Jwt jwt) {
        User user = userRepository.findById(jwt.getSubject())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        String storageKey = user.getAvatarStorageKey();
        if (storageKey != null) {
            user.setAvatarStorageKey(null);
            user.setAvatarMimeType(null);
            userRepository.saveAndFlush(user);
            storageService.delete(storageKey);
        }
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{userId}/avatar")
    public ResponseEntity<Resource> getAvatar(@PathVariable String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found."));
        if (!StringUtils.hasText(user.getAvatarStorageKey()) || !StringUtils.hasText(user.getAvatarMimeType())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "This user has no profile image.");
        }
        Resource image = storageService.load(user.getAvatarStorageKey());
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(user.getAvatarMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(image);
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
