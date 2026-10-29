package com.subspring.chatapp.backend.entities;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "room_invitations")
@Getter
@Setter
@NoArgsConstructor
public class RoomInvitation {
    @Id
    @Column(name = "id", nullable = false, columnDefinition = "text")
    private String id;

    @Column(name = "room_id", nullable = false, columnDefinition = "text")
    private String roomId;

    @Column(name = "inviter_id", nullable = false, columnDefinition = "text")
    private String inviterId;

    @Column(name = "invitee_id", nullable = false, columnDefinition = "text")
    private String inviteeId;

    @Column(name = "status", nullable = false, columnDefinition = "text")
    private String status = "PENDING";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    @PrePersist
    void setCreatedAt() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
