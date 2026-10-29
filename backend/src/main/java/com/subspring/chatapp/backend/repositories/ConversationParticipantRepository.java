package com.subspring.chatapp.backend.repositories;

import com.subspring.chatapp.backend.entities.ConversationParticipant;
import com.subspring.chatapp.backend.entities.ConversationParticipantId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ConversationParticipantRepository
        extends JpaRepository<ConversationParticipant, ConversationParticipantId> {

    boolean existsByIdConversationIdAndIdUserId(String conversationId, String userId);

    List<ConversationParticipant> findByIdUserId(String userId);

    List<ConversationParticipant> findByIdConversationId(String conversationId);
}
