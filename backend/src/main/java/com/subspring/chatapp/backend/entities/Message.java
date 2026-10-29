package com.subspring.chatapp.backend.entities;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Index;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(
        name = "messages",
        uniqueConstraints = @UniqueConstraint(
                name = "messages_conversation_id_sender_id_client_message_id_key",
                columnNames = {"conversation_id", "sender_id", "client_message_id"}
        )
)
@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, columnDefinition = "text")
    private String id;

    @Column(name = "content", columnDefinition = "text")
    private String content;

    @Column(name = "client_message_id", columnDefinition = "text")
    private String clientMessageId;

    @Column(name = "type", nullable = false, columnDefinition = "text")
    private String type = "TEXT";

    @Column(name = "\"createdAt\"", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "edited_at")
    private LocalDateTime editedAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Column(name = "conversation_id", nullable = false, columnDefinition = "text")
    private String conversationId;

    @Column(name = "sender_id", nullable = false, columnDefinition = "text")
    private String senderId;

    @PrePersist
    void setCreationTimestamp() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
