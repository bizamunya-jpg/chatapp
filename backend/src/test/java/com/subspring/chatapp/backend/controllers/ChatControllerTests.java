package com.subspring.chatapp.backend.controllers;

import com.subspring.chatapp.backend.dto.MessageRequest;
import com.subspring.chatapp.backend.entities.Message;
import com.subspring.chatapp.backend.entities.Room;
import com.subspring.chatapp.backend.repositories.MessageRepository;
import com.subspring.chatapp.backend.repositories.ConversationParticipantRepository;
import com.subspring.chatapp.backend.repositories.RoomRepository;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Optional;
import java.security.Principal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChatControllerTests {

    @Test
    void savesMessageBeforeBroadcastingItToRoomSubscribers() {
        RoomRepository roomRepository = mock(RoomRepository.class);
        MessageRepository messageRepository = mock(MessageRepository.class);
        ConversationParticipantRepository participantRepository = mock(ConversationParticipantRepository.class);
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);

        Room room = new Room();
        room.setId("room-id");
        room.setTitle("jasmine");
        when(roomRepository.findById("jasmine")).thenReturn(Optional.empty());
        when(roomRepository.findFirstByTitleOrderByCreatedAtAsc("jasmine")).thenReturn(Optional.of(room));
        when(participantRepository.existsByIdConversationIdAndIdUserId("room-id", "user-id")).thenReturn(true);
        when(messageRepository.saveAndFlush(any(Message.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        MessageRequest request = new MessageRequest("Hello", "user-id", "jasmine");

        ChatController controller = new ChatController(
                roomRepository,
                messageRepository,
                participantRepository,
                messagingTemplate
        );
        Message savedMessage = controller.sendMessage("jasmine", request, principal("user-id"));

        assertEquals("Hello", savedMessage.getContent());
        assertEquals("user-id", savedMessage.getSenderId());
        assertEquals("room-id", savedMessage.getConversationId());
        assertNotNull(savedMessage.getCreatedAt());
        verify(messageRepository).saveAndFlush(savedMessage);
        verify(messagingTemplate).convertAndSend("/topic/room/jasmine", savedMessage);
    }

    @Test
    void rejectsMessageWhenRoomDoesNotExist() {
        RoomRepository roomRepository = mock(RoomRepository.class);
        MessageRepository messageRepository = mock(MessageRepository.class);
        ConversationParticipantRepository participantRepository = mock(ConversationParticipantRepository.class);
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        when(roomRepository.findById("missing")).thenReturn(Optional.empty());
        when(roomRepository.findFirstByTitleOrderByCreatedAtAsc("missing")).thenReturn(Optional.empty());

        ChatController controller = new ChatController(
                roomRepository,
                messageRepository,
                participantRepository,
                messagingTemplate
        );

        assertThrows(
                IllegalArgumentException.class,
                () -> controller.sendMessage("missing", new MessageRequest("Hello", "user-id", "missing"), principal("user-id"))
        );
        verify(messageRepository, never()).saveAndFlush(any(Message.class));
        verify(messagingTemplate, never()).convertAndSend(any(String.class), any(Object.class));
    }

    private Principal principal(String userId) {
        return () -> userId;
    }
}
