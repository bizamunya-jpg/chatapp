package com.subspring.chatapp.backend.repositories;

import java.util.List;
import java.util.Optional;

import com.subspring.chatapp.backend.entities.RoomInvitation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoomInvitationRepository extends JpaRepository<RoomInvitation, String> {
    boolean existsByRoomIdAndInviteeIdAndStatus(String roomId, String inviteeId, String status);

    List<RoomInvitation> findByInviteeIdAndStatusOrderByCreatedAtDesc(String inviteeId, String status);

    Optional<RoomInvitation> findByIdAndInviteeId(String id, String inviteeId);
}
