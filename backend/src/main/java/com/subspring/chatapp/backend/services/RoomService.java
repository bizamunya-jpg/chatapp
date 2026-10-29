package com.subspring.chatapp.backend.services;

import com.subspring.chatapp.backend.entities.ConversationParticipant;
import com.subspring.chatapp.backend.entities.ConversationParticipantId;
import com.subspring.chatapp.backend.entities.Room;
import com.subspring.chatapp.backend.entities.RoomRole;
import com.subspring.chatapp.backend.repositories.ConversationParticipantRepository;
import com.subspring.chatapp.backend.repositories.RoomRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RoomService {
    private final RoomRepository roomRepository;
    private final ConversationParticipantRepository participantRepository;

    public RoomService(RoomRepository roomRepository, ConversationParticipantRepository participantRepository) {
        this.roomRepository = roomRepository;
        this.participantRepository = participantRepository;
    }

    @Transactional
    public Room createRoom(String title, String creatorId) {
        Room room = new Room();
        room.setTitle(title);
        room.setOwnerId(creatorId);
        Room savedRoom = roomRepository.saveAndFlush(room);

        ConversationParticipant participant = new ConversationParticipant();
        participant.setId(new ConversationParticipantId(savedRoom.getId(), creatorId));
        participant.setRole(RoomRole.ADMIN);
        participantRepository.saveAndFlush(participant);
        return savedRoom;
    }
}
