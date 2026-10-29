package com.subspring.chatapp.backend.entities;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "call_participants")
@Getter
@Setter
@NoArgsConstructor
public class CallParticipant {
    @EmbeddedId
    private CallParticipantId id;

    @Column(name = "status", nullable = false, columnDefinition = "text")
    private String status = "RINGING";

    @Column(name = "joined_at", nullable = false)
    private LocalDateTime joinedAt;

    @Column(name = "left_at")
    private LocalDateTime leftAt;

    @PrePersist
    void setJoinedAt() {
        if (joinedAt == null) joinedAt = LocalDateTime.now();
    }
}
