package com.subspring.chatapp.backend.repositories;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import com.subspring.chatapp.backend.entities.CallParticipant;
import com.subspring.chatapp.backend.entities.CallParticipantId;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CallParticipantRepository extends JpaRepository<CallParticipant, CallParticipantId> {
    List<CallParticipant> findByIdCallIdOrderByJoinedAtAsc(String callId);

    List<CallParticipant> findByIdUserIdAndStatusIn(String userId, Collection<String> statuses);

    Optional<CallParticipant> findByIdCallIdAndIdUserId(String callId, String userId);

    boolean existsByIdCallIdAndIdUserIdAndStatus(String callId, String userId, String status);
}
