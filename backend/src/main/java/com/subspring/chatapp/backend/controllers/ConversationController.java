package com.subspring.chatapp.backend.controllers;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import com.subspring.chatapp.backend.dto.CreateDirectConversationRequest;
import com.subspring.chatapp.backend.dto.CreateMessageRequest;
import com.subspring.chatapp.backend.dto.MarkReadRequest;
import com.subspring.chatapp.backend.dto.RoomParticipantProfile;
import com.subspring.chatapp.backend.dto.AddParticipantRequest;
import com.subspring.chatapp.backend.dto.UpdateMessageRequest;
import com.subspring.chatapp.backend.entities.ConversationParticipant;
import com.subspring.chatapp.backend.entities.ConversationParticipantId;
import com.subspring.chatapp.backend.entities.Message;
import com.subspring.chatapp.backend.entities.Room;
import com.subspring.chatapp.backend.entities.RoomRole;
import com.subspring.chatapp.backend.repositories.ConversationParticipantRepository;
import com.subspring.chatapp.backend.repositories.MessageRepository;
import com.subspring.chatapp.backend.repositories.RoomRepository;
import com.subspring.chatapp.backend.repositories.UserRepository;
import com.subspring.chatapp.backend.services.ConversationService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import com.subspring.chatapp.backend.services.RealtimePublisher;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/conversations")
public class ConversationController {
    private final RoomRepository roomRepository;
    private final ConversationParticipantRepository participantRepository;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private final RealtimePublisher realtimePublisher;
    private final ConversationService conversationService;

    public ConversationController(
            RoomRepository roomRepository,
            ConversationParticipantRepository participantRepository,
            MessageRepository messageRepository,
            UserRepository userRepository,
            RealtimePublisher realtimePublisher,
            ConversationService conversationService
    ) {
        this.roomRepository = roomRepository;
        this.participantRepository = participantRepository;
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
        this.realtimePublisher = realtimePublisher;
        this.conversationService = conversationService;
    }

    @GetMapping
    public List<Room> listConversations(@AuthenticationPrincipal Jwt jwt) {
        List<String> ids = participantRepository.findByIdUserId(jwt.getSubject()).stream()
                .map(participant -> participant.getId().getConversationId())
                .toList();
        return roomRepository.findAllById(ids);
    }

    @GetMapping("/{conversationId}/participants")
    public ResponseEntity<?> listParticipants(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String conversationId
    ) {
        ResponseEntity<?> accessDenied = requireMembership(conversationId, jwt.getSubject());
        if (accessDenied != null) {
            return accessDenied;
        }

        List<RoomParticipantProfile> participants = participantRepository.findByIdConversationId(conversationId).stream()
                .map(participant -> userRepository.findById(participant.getId().getUserId())
                        .map(user -> new RoomParticipantProfile(
                                user.getId(),
                                user.getUsername(),
                                user.getName(),
                                com.subspring.chatapp.backend.dto.UserProfile.avatarUrl(user),
                                participant.getRole()
                        ))
                        .orElse(null))
                .filter(java.util.Objects::nonNull)
                .toList();
        return ResponseEntity.ok(participants);
    }

    @PostMapping("/direct")
    public ResponseEntity<?> createDirectConversation(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateDirectConversationRequest request
    ) {
        String currentUserId = jwt.getSubject();
        if (currentUserId.equals(request.userId()) || !userRepository.existsById(request.userId())) {
            return ResponseEntity.badRequest().body(Map.of("error", "A different, existing user is required."));
        }
        String directKey = ConversationService.directKey(currentUserId, request.userId());
        boolean alreadyExists = roomRepository.findByDirectKey(directKey).isPresent();
        try {
            Room conversation = conversationService.createDirectConversation(currentUserId, request.userId());
            return ResponseEntity.status(alreadyExists ? HttpStatus.OK : HttpStatus.CREATED).body(conversation);
        } catch (DataIntegrityViolationException exception) {
            return roomRepository.findByDirectKey(directKey)
                    .<ResponseEntity<?>>map(conversation -> ResponseEntity.ok(conversation))
                    .orElseThrow(() -> exception);
        }
    }

    @PostMapping("/{conversationId}/participants")
    @Transactional
    public ResponseEntity<?> addParticipant(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String conversationId,
            @Valid @RequestBody AddParticipantRequest request
    ) {
        ResponseEntity<?> accessDenied = requireMembership(conversationId, jwt.getSubject());
        if (accessDenied != null) {
            return accessDenied;
        }
        Room room = roomRepository.findById(conversationId).orElseThrow();
        if (!"GROUP".equals(room.getType())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Participants cannot be added to a direct conversation."));
        }
        if (!isRoomAdmin(conversationId, jwt.getSubject())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only room admins can add participants directly."));
        }
        if (!userRepository.existsById(request.userId())) {
            return ResponseEntity.notFound().build();
        }
        if (participantRepository.existsByIdConversationIdAndIdUserId(conversationId, request.userId())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "User already belongs to this conversation."));
        }
        ConversationParticipant newParticipant = newParticipant(conversationId, request.userId());
        newParticipant.setRole(RoomRole.PARTICIPANT);
        participantRepository.saveAndFlush(newParticipant);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @GetMapping("/{conversationId}/messages")
    public ResponseEntity<?> listMessages(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String conversationId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size
    ) {
        if (page < 0 || size < 1 || size > 100) {
            return ResponseEntity.badRequest().body(Map.of("error", "Page must be non-negative and size must be 1-100."));
        }
        ResponseEntity<?> accessDenied = requireMembership(conversationId, jwt.getSubject());
        if (accessDenied != null) {
            return accessDenied;
        }
        Page<Message> messages = messageRepository.findByConversationIdOrderByCreatedAtDesc(
                conversationId,
                PageRequest.of(page, size)
        );
        List<Message> orderedMessages = new ArrayList<>(messages.getContent());
        Collections.reverse(orderedMessages);
        return ResponseEntity.ok(orderedMessages);
    }

    @PostMapping("/{conversationId}/messages")
    @Transactional
    public ResponseEntity<?> sendMessage(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String conversationId,
            @Valid @RequestBody CreateMessageRequest request
    ) {
        ResponseEntity<?> accessDenied = requireMembership(conversationId, jwt.getSubject());
        if (accessDenied != null) {
            return accessDenied;
        }
        String clientMessageId = request.clientMessageId() == null || request.clientMessageId().isBlank()
                ? null
                : request.clientMessageId().trim();
        if (clientMessageId != null) {
            var existing = messageRepository.findByConversationIdAndSenderIdAndClientMessageId(
                    conversationId,
                    jwt.getSubject(),
                    clientMessageId
            );
            if (existing.isPresent()) {
                return ResponseEntity.ok(existing.get());
            }
        }
        Message message = new Message();
        message.setConversationId(conversationId);
        message.setSenderId(jwt.getSubject());
        message.setContent(request.content().trim());
        message.setClientMessageId(clientMessageId);
        message.setType("TEXT");
        message.setCreatedAt(LocalDateTime.now());
        Message savedMessage = messageRepository.saveAndFlush(message);
        realtimePublisher.publish("/topic/room/" + conversationId, savedMessage);
        return ResponseEntity.status(HttpStatus.CREATED).body(savedMessage);
    }

    @PatchMapping("/{conversationId}/messages/{messageId}")
    @Transactional
    public ResponseEntity<?> editMessage(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String conversationId,
            @PathVariable String messageId,
            @Valid @RequestBody UpdateMessageRequest request
    ) {
        ResponseEntity<?> accessDenied = requireMembership(conversationId, jwt.getSubject());
        if (accessDenied != null) {
            return accessDenied;
        }
        Message message = messageRepository.findByIdAndConversationId(messageId, conversationId)
                .orElse(null);
        if (message == null) {
            return ResponseEntity.notFound().build();
        }
        if (!jwt.getSubject().equals(message.getSenderId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only the message author can edit it."));
        }
        if (message.getDeletedAt() != null || !"TEXT".equals(message.getType())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "This message cannot be edited."));
        }
        message.setContent(request.content().trim());
        message.setEditedAt(LocalDateTime.now());
        Message updatedMessage = messageRepository.saveAndFlush(message);
        realtimePublisher.publish("/topic/room/" + conversationId, updatedMessage);
        return ResponseEntity.ok(updatedMessage);
    }

    @DeleteMapping("/{conversationId}/messages/{messageId}")
    @Transactional
    public ResponseEntity<?> deleteMessage(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String conversationId,
            @PathVariable String messageId
    ) {
        ResponseEntity<?> accessDenied = requireMembership(conversationId, jwt.getSubject());
        if (accessDenied != null) {
            return accessDenied;
        }
        Message message = messageRepository.findByIdAndConversationId(messageId, conversationId)
                .orElse(null);
        if (message == null) {
            return ResponseEntity.notFound().build();
        }
        if (!jwt.getSubject().equals(message.getSenderId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only the message author can delete it."));
        }
        message.setContent(null);
        message.setDeletedAt(LocalDateTime.now());
        Message deletedMessage = messageRepository.saveAndFlush(message);
        realtimePublisher.publish("/topic/room/" + conversationId, deletedMessage);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{conversationId}/read")
    @Transactional
    public ResponseEntity<?> markRead(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String conversationId,
            @Valid @RequestBody MarkReadRequest request
    ) {
        ResponseEntity<?> accessDenied = requireMembership(conversationId, jwt.getSubject());
        if (accessDenied != null) {
            return accessDenied;
        }
        if (!messageRepository.existsByIdAndConversationId(request.messageId(), conversationId)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Message does not belong to this conversation."));
        }
        ConversationParticipant participant = participantRepository.findById(
                new ConversationParticipantId(conversationId, jwt.getSubject())
        ).orElseThrow(() -> new IllegalStateException("Conversation membership disappeared during read update."));
        participant.setLastReadMessageId(request.messageId());
        participantRepository.save(participant);
        return ResponseEntity.noContent().build();
    }

    private ResponseEntity<?> requireMembership(String conversationId, String userId) {
        if (!roomRepository.existsById(conversationId)) {
            return ResponseEntity.notFound().build();
        }
        if (!participantRepository.existsByIdConversationIdAndIdUserId(conversationId, userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "You do not have access to this conversation."));
        }
        return null;
    }

    private boolean isRoomAdmin(String roomId, String userId) {
        return participantRepository.findById(new ConversationParticipantId(roomId, userId))
                .map(participant -> participant.getRole() == RoomRole.ADMIN)
                .orElse(false);
    }

    private ConversationParticipant newParticipant(String conversationId, String userId) {
        ConversationParticipant participant = new ConversationParticipant();
        participant.setId(new ConversationParticipantId(conversationId, userId));
        return participant;
    }
}
