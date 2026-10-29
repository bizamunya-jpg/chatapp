package com.subspring.chatapp.backend.entities;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "conversation_participants")
@Getter
@Setter
@NoArgsConstructor
public class ConversationParticipant {
    @EmbeddedId
    private ConversationParticipantId id;

    @Column(name = "joined_at", nullable = false)
    private LocalDateTime joinedAt;

    @Column(name = "last_read_message_id", columnDefinition = "text")
    private String lastReadMessageId;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, columnDefinition = "text")
    private RoomRole role = RoomRole.PARTICIPANT;

    @PrePersist
    void setJoinedAt() {
        if (joinedAt == null) {
            joinedAt = LocalDateTime.now();
        }
    }
}
