package com.subspring.chatapp.backend.repositories;

import java.util.List;
import java.util.Optional;

import com.subspring.chatapp.backend.entities.User;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, String> {

    boolean existsByEmailIgnoreCase(String email);

    boolean existsByUsernameIgnoreCase(String username);

    Optional<User> findByUsernameIgnoreCase(String username);

    List<User> findByUsernameContainingIgnoreCaseOrNameContainingIgnoreCase(
            String username,
            String name,
            Pageable pageable
    );
}
