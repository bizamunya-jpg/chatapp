package com.subspring.chatapp.backend.services;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.UUID;
import java.util.Base64;

import com.subspring.chatapp.backend.dto.AuthResponse;
import com.subspring.chatapp.backend.dto.LoginRequest;
import com.subspring.chatapp.backend.dto.RegisterRequest;
import com.subspring.chatapp.backend.dto.UserProfile;
import com.subspring.chatapp.backend.entities.RefreshToken;
import com.subspring.chatapp.backend.entities.User;
import com.subspring.chatapp.backend.repositories.RefreshTokenRepository;
import com.subspring.chatapp.backend.repositories.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {
    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtEncoder jwtEncoder;
    private final Duration accessTokenTtl;
    private final Duration refreshTokenTtl;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            PasswordEncoder passwordEncoder,
            JwtEncoder jwtEncoder,
            Duration accessTokenTtl,
            Duration refreshTokenTtl
    ) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtEncoder = jwtEncoder;
        this.accessTokenTtl = accessTokenTtl;
        this.refreshTokenTtl = refreshTokenTtl;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Password must not exceed 72 UTF-8 bytes."
            );
        }
        String username = request.username().trim().toLowerCase(Locale.ROOT);
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        if (userRepository.existsByUsernameIgnoreCase(username)) {
            throw new DataIntegrityViolationException("Username already exists.");
        }
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new DataIntegrityViolationException("Email already exists.");
        }

        User user = new User();
        user.setUsername(username);
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setName(request.displayName() == null || request.displayName().isBlank()
                ? username
                : request.displayName().trim());
        return issueTokens(userRepository.saveAndFlush(user));
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        String username = request.username().trim().toLowerCase(Locale.ROOT);
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new BadCredentialsException("Invalid login or password.");
        }
        User user = userRepository.findByUsernameIgnoreCase(username)
                .orElseThrow(() -> new BadCredentialsException("Invalid login or password."));
        if (user.getPasswordHash() == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BadCredentialsException("Invalid login or password.");
        }
        return issueTokens(user);
    }

    @Transactional
    public AuthResponse refresh(String rawRefreshToken) {
        String hash = hashToken(rawRefreshToken);
        RefreshToken oldToken = refreshTokenRepository.findActiveTokenForUpdate(hash)
                .orElseThrow(() -> new BadCredentialsException("Invalid refresh token."));
        if (!oldToken.getExpiresAt().isAfter(LocalDateTime.now())) {
            oldToken.setRevokedAt(LocalDateTime.now());
            throw new BadCredentialsException("Refresh token has expired.");
        }

        User user = userRepository.findById(oldToken.getUserId())
                .orElseThrow(() -> new BadCredentialsException("Refresh token user no longer exists."));
        oldToken.setRevokedAt(LocalDateTime.now());
        return issueTokens(user);
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        refreshTokenRepository.findActiveTokenForUpdate(hashToken(rawRefreshToken))
                .ifPresent(token -> token.setRevokedAt(LocalDateTime.now()));
    }

    private AuthResponse issueTokens(User user) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(accessTokenTtl);
        JwtClaimsSet.Builder claimsBuilder = JwtClaimsSet.builder()
                .issuer("chatapp")
                .id(UUID.randomUUID().toString())
                .issuedAt(now)
                .expiresAt(expiresAt)
                .subject(user.getId());
        if (user.getUsername() != null) {
            claimsBuilder.claim("username", user.getUsername());
        }
        JwtClaimsSet claims = claimsBuilder.build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String accessToken = jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        String refreshTokenValue = newRefreshTokenValue();

        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setUserId(user.getId());
        refreshToken.setTokenHash(hashToken(refreshTokenValue));
        refreshToken.setExpiresAt(LocalDateTime.now().plus(refreshTokenTtl));
        refreshTokenRepository.save(refreshToken);

        return new AuthResponse(
                accessToken,
                refreshTokenValue,
                "Bearer",
                expiresAt,
                UserProfile.from(user)
        );
    }

    private String newRefreshTokenValue() {
        byte[] tokenBytes = new byte[64];
        secureRandom.nextBytes(tokenBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
    }

    private String hashToken(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(digest);
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required to hash refresh tokens.", exception);
        }
    }
}
