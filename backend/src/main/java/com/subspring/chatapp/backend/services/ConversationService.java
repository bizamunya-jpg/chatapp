package com.subspring.chatapp.backend.services;

import com.subspring.chatapp.backend.entities.ConversationParticipant;
import com.subspring.chatapp.backend.entities.ConversationParticipantId;
import com.subspring.chatapp.backend.entities.Room;
import com.subspring.chatapp.backend.repositories.ConversationParticipantRepository;
import com.subspring.chatapp.backend.repositories.RoomRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ConversationService {
    private final RoomRepository roomRepository;
    private final ConversationParticipantRepository participantRepository;

    public ConversationService(
            RoomRepository roomRepository,
            ConversationParticipantRepository participantRepository
    ) {
        this.roomRepository = roomRepository;
        this.participantRepository = participantRepository;
    }

    @Transactional
    public Room createDirectConversation(String currentUserId, String otherUserId) {
        String directKey = directKey(currentUserId, otherUserId);
        Room existing = roomRepository.findByDirectKey(directKey).orElse(null);
        if (existing != null) {
            return existing;
        }

        Room conversation = new Room();
        conversation.setType("DIRECT");
        conversation.setDirectKey(directKey);
        Room savedConversation = roomRepository.saveAndFlush(conversation);
        participantRepository.save(newParticipant(savedConversation.getId(), currentUserId));
        participantRepository.saveAndFlush(newParticipant(savedConversation.getId(), otherUserId));
        return savedConversation;
    }

    public static String directKey(String firstUserId, String secondUserId) {
        return firstUserId.compareTo(secondUserId) < 0
                ? firstUserId + ":" + secondUserId
                : secondUserId + ":" + firstUserId;
    }

    private ConversationParticipant newParticipant(String conversationId, String userId) {
        ConversationParticipant participant = new ConversationParticipant();
        participant.setId(new ConversationParticipantId(conversationId, userId));
        return participant;
    }
}
