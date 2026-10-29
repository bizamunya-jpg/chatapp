package com.subspring.chatapp.backend.controllers;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.subspring.chatapp.backend.dto.AddParticipantRequest;
import com.subspring.chatapp.backend.dto.CreateRoomRequest;
import com.subspring.chatapp.backend.dto.JoinRoomDecisionRequest;
import com.subspring.chatapp.backend.dto.RoomInvitationDecisionRequest;
import com.subspring.chatapp.backend.dto.RoomSummary;
import com.subspring.chatapp.backend.dto.RoomParticipantProfile;
import com.subspring.chatapp.backend.dto.UpdateRoomParticipantRoleRequest;
import com.subspring.chatapp.backend.entities.ConversationParticipant;
import com.subspring.chatapp.backend.entities.ConversationParticipantId;
import com.subspring.chatapp.backend.entities.Room;
import com.subspring.chatapp.backend.entities.RoomInvitation;
import com.subspring.chatapp.backend.entities.RoomJoinRequest;
import com.subspring.chatapp.backend.entities.RoomRole;
import com.subspring.chatapp.backend.repositories.ConversationParticipantRepository;
import com.subspring.chatapp.backend.repositories.RoomInvitationRepository;
import com.subspring.chatapp.backend.repositories.RoomJoinRequestRepository;
import com.subspring.chatapp.backend.repositories.RoomRepository;
import com.subspring.chatapp.backend.repositories.UserRepository;
import com.subspring.chatapp.backend.services.RoomService;
import jakarta.validation.Valid;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class RoomController {
    private final RoomRepository roomRepository;
    private final ConversationParticipantRepository participantRepository;
    private final RoomJoinRequestRepository joinRequestRepository;
    private final RoomInvitationRepository invitationRepository;
    private final UserRepository userRepository;
    private final RoomService roomService;

    public RoomController(
            RoomRepository roomRepository,
            ConversationParticipantRepository participantRepository,
            RoomJoinRequestRepository joinRequestRepository,
            RoomInvitationRepository invitationRepository,
            UserRepository userRepository,
            RoomService roomService
    ) {
        this.roomRepository = roomRepository;
        this.participantRepository = participantRepository;
        this.joinRequestRepository = joinRequestRepository;
        this.invitationRepository = invitationRepository;
        this.userRepository = userRepository;
        this.roomService = roomService;
    }

    @PostMapping("/api/v1/room")
    public ResponseEntity<?> createRoom(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateRoomRequest request
    ) {
        String title = request.roomname().trim();
        if (roomRepository.existsByTitle(title)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "A room with that name already exists."));
        }

        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(roomService.createRoom(title, jwt.getSubject()));
        } catch (DataIntegrityViolationException exception) {
            if (roomRepository.existsByTitle(title)) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "A room with that name already exists."));
            }
            throw exception;
        }
    }

    @GetMapping("/api/v1/rooms")
    public List<RoomSummary> listAvailableRooms() {
        return roomRepository.findByTypeOrderByCreatedAtDesc("GROUP")
                .stream()
                .map(RoomSummary::from)
                .toList();
    }

    @DeleteMapping("/api/v1/room/{roomId}")
    @Transactional
    public ResponseEntity<?> deleteRoom(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String roomId
    ) {
        Room room = findGroup(roomId);
        if (room == null) {
            return ResponseEntity.notFound().build();
        }
        if (!isRoomAdmin(roomId, jwt.getSubject())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only room admins can delete a room."));
        }
        roomRepository.delete(room);
        roomRepository.flush();
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/v1/room/{roomId}/participants")
    public ResponseEntity<?> listParticipants(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String roomId
    ) {
        Room room = findGroup(roomId);
        if (room == null) {
            return ResponseEntity.notFound().build();
        }
        if (!participantRepository.existsByIdConversationIdAndIdUserId(roomId, jwt.getSubject())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only room participants can view the member list."));
        }

        List<RoomParticipantProfile> participants = participantRepository.findByIdConversationId(roomId).stream()
                .map(participant -> userRepository.findById(participant.getId().getUserId())
                        .map(user -> new RoomParticipantProfile(
                                user.getId(),
                                user.getUsername(),
                                user.getName(),
                                participant.getRole()
                        ))
                        .orElse(null))
                .filter(java.util.Objects::nonNull)
                .toList();
        return ResponseEntity.ok(participants);
    }

    @PatchMapping("/api/v1/room/{roomId}/participants/{userId}/role")
    @Transactional
    public ResponseEntity<?> updateParticipantRole(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String roomId,
            @PathVariable String userId,
            @Valid @RequestBody UpdateRoomParticipantRoleRequest request
    ) {
        Room room = findGroup(roomId);
        if (room == null) {
            return ResponseEntity.notFound().build();
        }
        if (!isRoomAdmin(roomId, jwt.getSubject())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only room admins can change participant roles."));
        }
        ConversationParticipant target = participantRepository.findById(
                new ConversationParticipantId(roomId, userId)
        ).orElse(null);
        if (target == null) {
            return ResponseEntity.notFound().build();
        }
        if (target.getId().getUserId().equals(jwt.getSubject())
                && target.getRole() == RoomRole.ADMIN
                && request.role() != RoomRole.ADMIN
                && participantRepository.findByIdConversationId(roomId).stream()
                .filter(participant -> participant.getRole() == RoomRole.ADMIN)
                .count() == 1) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "A room must have at least one admin."));
        }
        target.setRole(request.role());
        participantRepository.saveAndFlush(target);
        var user = userRepository.findById(userId).orElseThrow();
        return ResponseEntity.ok(new RoomParticipantProfile(
                user.getId(),
                user.getUsername(),
                user.getName(),
                target.getRole()
        ));
    }

    @PostMapping("/api/v1/rooms/{roomId}/join-requests")
    public ResponseEntity<?> requestToJoin(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String roomId
    ) {
        Room room = findGroup(roomId);
        if (room == null) {
            return ResponseEntity.notFound().build();
        }
        String userId = jwt.getSubject();
        if (participantRepository.existsByIdConversationIdAndIdUserId(roomId, userId)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "You are already a room participant."));
        }
        if (room.getOwnerId() == null) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "This room has no owner to approve join requests."));
        }
        if (joinRequestRepository.existsByRoomIdAndUserIdAndStatus(roomId, userId, "PENDING")) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "A join request is already pending."));
        }

        RoomJoinRequest request = new RoomJoinRequest();
        request.setId(UUID.randomUUID().toString());
        request.setRoomId(roomId);
        request.setUserId(userId);
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(joinRequestRepository.saveAndFlush(request));
        } catch (DataIntegrityViolationException exception) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "A join request is already pending."));
        }
    }

    @GetMapping("/api/v1/rooms/{roomId}/join-request")
    public ResponseEntity<?> getMyJoinRequest(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String roomId
    ) {
        if (!roomRepository.existsById(roomId)) {
            return ResponseEntity.notFound().build();
        }
        return joinRequestRepository.findByRoomIdAndUserIdOrderByCreatedAtDesc(roomId, jwt.getSubject())
                .stream()
                .findFirst()
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/api/v1/room/{roomId}/join-requests")
    public ResponseEntity<?> listPendingJoinRequests(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String roomId
    ) {
        Room room = roomRepository.findById(roomId).orElse(null);
        if (room == null || !"GROUP".equals(room.getType())) {
            return ResponseEntity.notFound().build();
        }
        if (!isRoomAdmin(roomId, jwt.getSubject())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only room admins can review join requests."));
        }
        return ResponseEntity.ok(joinRequestRepository.findByRoomIdAndStatusOrderByCreatedAtAsc(roomId, "PENDING"));
    }

    @PatchMapping("/api/v1/room/{roomId}/join-requests/{requestId}")
    @Transactional
    public ResponseEntity<?> decideJoinRequest(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String roomId,
            @PathVariable String requestId,
            @Valid @RequestBody JoinRoomDecisionRequest decision
    ) {
        Room room = roomRepository.findById(roomId).orElse(null);
        if (room == null || !"GROUP".equals(room.getType())) {
            return ResponseEntity.notFound().build();
        }
        if (!isRoomAdmin(roomId, jwt.getSubject())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only room admins can review join requests."));
        }
        RoomJoinRequest request = joinRequestRepository.findByIdAndRoomId(requestId, roomId).orElse(null);
        if (request == null) {
            return ResponseEntity.notFound().build();
        }
        if (!"PENDING".equals(request.getStatus())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "This join request has already been resolved."));
        }

        request.setStatus(decision.approved() ? "APPROVED" : "REJECTED");
        request.setResolvedAt(LocalDateTime.now());
        if (decision.approved()) {
            participantRepository.saveAndFlush(newParticipant(roomId, request.getUserId(), RoomRole.PARTICIPANT));
        }
        return ResponseEntity.ok(joinRequestRepository.saveAndFlush(request));
    }

    @PostMapping("/api/v1/room/{roomId}/invitations")
    public ResponseEntity<?> inviteUser(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String roomId,
            @Valid @RequestBody AddParticipantRequest request
    ) {
        Room room = findGroup(roomId);
        if (room == null) {
            return ResponseEntity.notFound().build();
        }
        String inviterId = jwt.getSubject();
        if (!isRoomAdmin(roomId, inviterId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Only room admins can send invitations."));
        }
        if (!userRepository.existsById(request.userId())) {
            return ResponseEntity.notFound().build();
        }
        if (participantRepository.existsByIdConversationIdAndIdUserId(roomId, request.userId())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "This user is already a room participant."));
        }
        if (invitationRepository.existsByRoomIdAndInviteeIdAndStatus(roomId, request.userId(), "PENDING")) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "A room invitation is already pending for this user."));
        }

        RoomInvitation invitation = new RoomInvitation();
        invitation.setId(UUID.randomUUID().toString());
        invitation.setRoomId(roomId);
        invitation.setInviterId(inviterId);
        invitation.setInviteeId(request.userId());
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(invitationRepository.saveAndFlush(invitation));
        } catch (DataIntegrityViolationException exception) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "A room invitation is already pending for this user."));
        }
    }

    @GetMapping("/api/v1/room/invitations")
    public List<RoomInvitation> listMyPendingInvitations(@AuthenticationPrincipal Jwt jwt) {
        return invitationRepository.findByInviteeIdAndStatusOrderByCreatedAtDesc(jwt.getSubject(), "PENDING");
    }

    @PatchMapping("/api/v1/room/invitations/{invitationId}")
    @Transactional
    public ResponseEntity<?> decideInvitation(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String invitationId,
            @Valid @RequestBody RoomInvitationDecisionRequest decision
    ) {
        RoomInvitation invitation = invitationRepository.findByIdAndInviteeId(invitationId, jwt.getSubject())
                .orElse(null);
        if (invitation == null) {
            return ResponseEntity.notFound().build();
        }
        if (!"PENDING".equals(invitation.getStatus())) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "This invitation has already been resolved."));
        }

        invitation.setStatus(decision.accepted() ? "ACCEPTED" : "DECLINED");
        invitation.setResolvedAt(LocalDateTime.now());
        if (decision.accepted()
                && !participantRepository.existsByIdConversationIdAndIdUserId(
                        invitation.getRoomId(),
                        invitation.getInviteeId()
                )) {
            participantRepository.saveAndFlush(newParticipant(
                    invitation.getRoomId(),
                    invitation.getInviteeId(),
                    RoomRole.PARTICIPANT
            ));
        }
        return ResponseEntity.ok(invitationRepository.saveAndFlush(invitation));
    }

    private Room findGroup(String roomId) {
        return roomRepository.findById(roomId)
                .filter(room -> "GROUP".equals(room.getType()))
                .orElse(null);
    }

    private boolean isRoomAdmin(String roomId, String userId) {
        return participantRepository.findById(new ConversationParticipantId(roomId, userId))
                .map(participant -> participant.getRole() == RoomRole.ADMIN)
                .orElse(false);
    }

    private ConversationParticipant newParticipant(String roomId, String userId, RoomRole role) {
        ConversationParticipant participant = new ConversationParticipant();
        participant.setId(new ConversationParticipantId(roomId, userId));
        participant.setRole(role);
        return participant;
    }
}
