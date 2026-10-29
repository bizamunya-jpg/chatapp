package com.subspring.chatapp.backend.repositories;

import com.subspring.chatapp.backend.entities.Room;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.Optional;
import java.util.List;

public interface RoomRepository extends JpaRepository<Room, String> {

    boolean existsByTitle(String title);

    Optional<Room> findFirstByTitleOrderByCreatedAtAsc(String title);

    Optional<Room> findByDirectKey(String directKey);

    List<Room> findByTypeOrderByCreatedAtDesc(String type);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select room from Room room where room.id = :id")
    Optional<Room> findByIdForUpdate(@Param("id") String id);
}
