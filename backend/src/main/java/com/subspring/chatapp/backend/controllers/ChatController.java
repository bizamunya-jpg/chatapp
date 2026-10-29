package com.subspring.chatapp.backend.controllers;

import com.subspring.chatapp.backend.dto.MessageRequest;
import com.subspring.chatapp.backend.entities.Message;
import com.subspring.chatapp.backend.entities.Room;
import com.subspring.chatapp.backend.repositories.MessageRepository;
import com.subspring.chatapp.backend.repositories.RoomRepository;
import com.subspring.chatapp.backend.repositories.ConversationParticipantRepository;
import java.security.Principal;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

import java.time.LocalDateTime;

@Controller
public class ChatController {
    private final RoomRepository roomRepository;
    private final MessageRepository messageRepository;
    private final ConversationParticipantRepository participantRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public ChatController(
            RoomRepository roomRepository,
            MessageRepository messageRepository,
            ConversationParticipantRepository participantRepository,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.roomRepository = roomRepository;
        this.messageRepository = messageRepository;
        this.participantRepository = participantRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/sendMessage/{roomId}")
    public Message sendMessage(
            @DestinationVariable String roomId,
            @Payload MessageRequest request,
            Principal principal
    ) {
        if (principal == null || principal.getName() == null || principal.getName().isBlank()) {
            throw new IllegalArgumentException("Authentication is required.");
        }
        if (request == null || request.getContent() == null || request.getContent().isBlank()
                || request.getContent().length() > 4000) {
            throw new IllegalArgumentException("Message content must contain 1-4000 characters.");
        }
        if (request.getClientMessageId() != null && request.getClientMessageId().length() > 100) {
            throw new IllegalArgumentException("Client message ID cannot exceed 100 characters.");
        }

        Room room = roomRepository.findById(roomId)
                .or(() -> roomRepository.findFirstByTitleOrderByCreatedAtAsc(roomId))
                .orElseThrow(() -> new IllegalArgumentException("Room not found."));
        if (!participantRepository.existsByIdConversationIdAndIdUserId(room.getId(), principal.getName())) {
            throw new IllegalArgumentException("You do not have access to this conversation.");
        }
        if (request.getClientMessageId() != null && !request.getClientMessageId().isBlank()) {
            String clientMessageId = request.getClientMessageId().trim();
            var existing = messageRepository.findByConversationIdAndSenderIdAndClientMessageId(
                    room.getId(),
                    principal.getName(),
                    clientMessageId
            );
            if (existing.isPresent()) {
                return existing.get();
            }
        }

        Message message = new Message();
        message.setContent(request.getContent().trim());
        message.setSenderId(principal.getName());
        message.setClientMessageId(request.getClientMessageId() == null
                ? null
                : request.getClientMessageId().trim());
        message.setConversationId(room.getId());
        message.setCreatedAt(LocalDateTime.now());

        Message savedMessage = messageRepository.saveAndFlush(message);
        messagingTemplate.convertAndSend("/topic/room/" + roomId, savedMessage);
        return savedMessage;
    }
}
