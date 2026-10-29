package com.subspring.chatapp.backend.repositories;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import com.subspring.chatapp.backend.entities.Call;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CallRepository extends JpaRepository<Call, String> {

    Optional<Call> findByIdAndConversationId(String id, String conversationId);

    boolean existsByConversationIdAndStatusIn(String conversationId, Collection<String> statuses);

    List<Call> findByConversationIdAndStatusInOrderByStartedAtDesc(
            String conversationId,
            Collection<String> statuses
    );

    List<Call> findByRecipientIdAndStatusInOrderByStartedAtDesc(
            String recipientId,
            Collection<String> statuses
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select call from Call call where call.id = :id and call.conversationId = :conversationId")
    Optional<Call> findByIdAndConversationIdForUpdate(
            @Param("id") String id,
            @Param("conversationId") String conversationId
    );
}
