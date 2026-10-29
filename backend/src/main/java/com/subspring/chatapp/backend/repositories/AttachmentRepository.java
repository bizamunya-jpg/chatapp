package com.subspring.chatapp.backend.repositories;

import java.util.Optional;

import com.subspring.chatapp.backend.entities.Attachment;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AttachmentRepository extends JpaRepository<Attachment, String> {

    Optional<Attachment> findByMessageId(String messageId);
}
