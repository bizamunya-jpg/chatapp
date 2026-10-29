package com.subspring.chatapp.backend.controllers;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import com.subspring.chatapp.backend.dto.UpdateCallRequest;
import com.subspring.chatapp.backend.dto.CallNotification;
import com.subspring.chatapp.backend.entities.Call;
import com.subspring.chatapp.backend.entities.Room;
import com.subspring.chatapp.backend.repositories.CallRepository;
import com.subspring.chatapp.backend.repositories.ConversationParticipantRepository;
import com.subspring.chatapp.backend.repositories.RoomRepository;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import com.subspring.chatapp.backend.services.RealtimePublisher;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/conversations/{conversationId}/calls")
public class CallController {
    private final RoomRepository roomRepository;
    private final ConversationParticipantRepository participantRepository;
    private final CallRepository callRepository;
    private final RealtimePublisher realtimePublisher;

    public CallController(
            RoomRepository roomRepository,
            ConversationParticipantRepository participantRepository,
            CallRepository callRepository,
            RealtimePublisher realtimePublisher
    ) {
        this.roomRepository = roomRepository;
        this.participantRepository = participantRepository;
        this.callRepository = callRepository;
        this.realtimePublisher = realtimePublisher;
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> startCall(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String conversationId
    ) {
        Room room = requireConversation(conversationId, jwt.getSubject(), true);
        List<String> participants = participantRepository.findByIdConversationId(conversationId).stream()
                .map(participant -> participant.getId().getUserId())
                .toList();
        if (!"DIRECT".equals(room.getType()) || participants.size() != 2) {
            return ResponseEntity.badRequest().body(Map.of("error", "Calls require a direct conversation with two users."));
        }
        if (callRepository.existsByConversationIdAndStatusIn(conversationId, List.of("RINGING", "ACCEPTED"))) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "A call is already active."));
        }

        String recipientId = participants.stream()
                .filter(id -> !id.equals(jwt.getSubject()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Direct conversation must have two distinct participants."));
        Call call = new Call();
        call.setConversationId(conversationId);
        call.setInitiatorId(jwt.getSubject());
        call.setRecipientId(recipientId);
        Call savedCall = callRepository.saveAndFlush(call);
        publishCallUpdate(savedCall);
        return ResponseEntity.status(HttpStatus.CREATED).body(savedCall);
    }

    @PatchMapping("/{callId}")
    @Transactional
    public ResponseEntity<?> updateCall(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String conversationId,
            @PathVariable String callId,
            @Valid @RequestBody UpdateCallRequest request
    ) {
        requireConversation(conversationId, jwt.getSubject(), false);
        Call call = callRepository.findByIdAndConversationIdForUpdate(callId, conversationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Call not found."));
        String userId = jwt.getSubject();
        boolean caller = userId.equals(call.getInitiatorId());
        boolean recipient = userId.equals(call.getRecipientId());
        if (!caller && !recipient) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not part of this call.");
        }

        String currentStatus = call.getStatus();
        String nextStatus = request.status();
        boolean validTransition = ("RINGING".equals(currentStatus)
                && ((recipient && ("ACCEPTED".equals(nextStatus) || "DECLINED".equals(nextStatus)))
                || (caller && "ENDED".equals(nextStatus))))
                || ("ACCEPTED".equals(currentStatus) && "ENDED".equals(nextStatus));
        if (!validTransition) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Call status transition is not allowed."));
        }
        call.setStatus(nextStatus);
        if ("ENDED".equals(nextStatus) || "DECLINED".equals(nextStatus)) {
            call.setEndedAt(LocalDateTime.now());
        }
        Call updatedCall = callRepository.saveAndFlush(call);
        publishCallUpdate(updatedCall);
        return ResponseEntity.ok(updatedCall);
    }

    private Room requireConversation(String conversationId, String userId, boolean lock) {
        Room room = (lock ? roomRepository.findByIdForUpdate(conversationId) : roomRepository.findById(conversationId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found."));
        if (!participantRepository.existsByIdConversationIdAndIdUserId(conversationId, userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have access to this conversation.");
        }
        return room;
    }

    private void publishCallUpdate(Call call) {
        CallNotification notification = new CallNotification(
                call.getId(),
                call.getConversationId(),
                call.getInitiatorId(),
                call.getRecipientId(),
                call.getStatus()
        );
        realtimePublisher.publish(
                "/topic/call-events/" + call.getConversationId(),
                notification
        );
    }
}
