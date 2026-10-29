package com.subspring.chatapp.backend.repositories;

import java.util.Optional;

import com.subspring.chatapp.backend.entities.OAuthAccount;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OAuthAccountRepository extends JpaRepository<OAuthAccount, String> {
    Optional<OAuthAccount> findByProviderAndProviderSubject(String provider, String providerSubject);
}
