package com.subspring.chatapp.backend.repositories;

import java.util.List;
import java.util.Optional;

import com.subspring.chatapp.backend.entities.RoomJoinRequest;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoomJoinRequestRepository extends JpaRepository<RoomJoinRequest, String> {
    boolean existsByRoomIdAndUserIdAndStatus(String roomId, String userId, String status);

    List<RoomJoinRequest> findByRoomIdAndStatusOrderByCreatedAtAsc(String roomId, String status);

    List<RoomJoinRequest> findByRoomIdAndUserIdOrderByCreatedAtDesc(String roomId, String userId);

    Optional<RoomJoinRequest> findByIdAndRoomId(String id, String roomId);
}
