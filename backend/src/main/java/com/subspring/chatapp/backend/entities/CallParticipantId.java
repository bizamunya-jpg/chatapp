package com.subspring.chatapp.backend.entities;

import java.io.Serializable;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class CallParticipantId implements Serializable {
    @Column(name = "call_id", nullable = false, columnDefinition = "text")
    private String callId;

    @Column(name = "user_id", nullable = false, columnDefinition = "text")
    private String userId;

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        if (!(other instanceof CallParticipantId that)) return false;
        return Objects.equals(callId, that.callId) && Objects.equals(userId, that.userId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(callId, userId);
    }
}
