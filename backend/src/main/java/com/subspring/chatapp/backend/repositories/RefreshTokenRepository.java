package com.subspring.chatapp.backend.repositories;

import java.util.Optional;

import com.subspring.chatapp.backend.entities.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, String> {

    @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select token from RefreshToken token where token.tokenHash = :tokenHash and token.revokedAt is null")
    Optional<RefreshToken> findActiveTokenForUpdate(@Param("tokenHash") String tokenHash);
}
