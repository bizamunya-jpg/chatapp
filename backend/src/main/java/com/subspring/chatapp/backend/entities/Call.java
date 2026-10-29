package com.subspring.chatapp.backend.entities;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "calls")
@Getter
@Setter
@NoArgsConstructor
public class Call {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, columnDefinition = "text")
    private String id;

    @Column(name = "conversation_id", nullable = false, columnDefinition = "text")
    private String conversationId;

    @Column(name = "initiator_id", nullable = false, columnDefinition = "text")
    private String initiatorId;

    @Column(name = "recipient_id", nullable = false, columnDefinition = "text")
    private String recipientId;

    @Column(name = "status", nullable = false, columnDefinition = "text")
    private String status = "RINGING";

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    @PrePersist
    void setStartedAt() {
        if (startedAt == null) {
            startedAt = LocalDateTime.now();
        }
    }
}
