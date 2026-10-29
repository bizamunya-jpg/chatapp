package com.subspring.chatapp.backend.repositories;

import com.subspring.chatapp.backend.entities.Message;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface MessageRepository extends JpaRepository<Message, String> {

    Page<Message> findByConversationIdOrderByCreatedAtDesc(String conversationId, Pageable pageable);

    Optional<Message> findByConversationIdAndSenderIdAndClientMessageId(
            String conversationId,
            String senderId,
            String clientMessageId
    );

    boolean existsByIdAndConversationId(String id, String conversationId);

    Optional<Message> findByIdAndConversationId(String id, String conversationId);
}
