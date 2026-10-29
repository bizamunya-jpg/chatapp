package com.subspring.chatapp.backend.config;

import java.util.List;

import com.subspring.chatapp.backend.repositories.CallRepository;
import com.subspring.chatapp.backend.repositories.ConversationParticipantRepository;
import com.subspring.chatapp.backend.repositories.RoomRepository;
import org.springframework.http.HttpHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

@Component
public class WebSocketAuthenticationInterceptor implements ChannelInterceptor {
    private static final String ROOM_TOPIC_PREFIX = "/topic/room/";
    private static final String SEND_DESTINATION_PREFIX = "/app/sendMessage/";

    private final JwtDecoder jwtDecoder;
    private final ConversationParticipantRepository participantRepository;
    private final RoomRepository roomRepository;
    private final CallRepository callRepository;

    public WebSocketAuthenticationInterceptor(
            JwtDecoder jwtDecoder,
            ConversationParticipantRepository participantRepository,
            RoomRepository roomRepository,
            CallRepository callRepository
    ) {
        this.jwtDecoder = jwtDecoder;
        this.participantRepository = participantRepository;
        this.roomRepository = roomRepository;
        this.callRepository = callRepository;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) {
            throw new MessagingException("STOMP headers are required.");
        }
        StompCommand command = accessor.getCommand();
        if (command == StompCommand.CONNECT) {
            authenticate(accessor);
        } else if (command == StompCommand.SUBSCRIBE || command == StompCommand.SEND) {
            String userId = accessor.getUser() == null ? null : accessor.getUser().getName();
            if (userId == null) {
                throw new MessagingException("A valid access token is required.");
            }
            String destination = accessor.getDestination();
            if (command == StompCommand.SUBSCRIBE && destination != null && destination.startsWith(ROOM_TOPIC_PREFIX)) {
                requireRoomMember(destination.substring(ROOM_TOPIC_PREFIX.length()), userId);
            } else if (command == StompCommand.SUBSCRIBE && destination != null
                    && destination.startsWith("/topic/call/")) {
                requireCallParticipant(destination.substring("/topic/call/".length()), userId);
            } else if (command == StompCommand.SUBSCRIBE && destination != null
                    && destination.startsWith("/topic/call-events/")) {
                requireRoomMember(destination.substring("/topic/call-events/".length()), userId);
            } else if (command == StompCommand.SEND && destination != null
                    && destination.startsWith(SEND_DESTINATION_PREFIX)) {
                requireRoomMember(destination.substring(SEND_DESTINATION_PREFIX.length()), userId);
            } else if (command == StompCommand.SEND && destination != null && destination.startsWith("/app/call/")) {
                requireRoomMember(destination.substring("/app/call/".length()), userId);
            } else {
                throw new MessagingException(command == StompCommand.SEND
                        ? "Send destination is not allowed."
                        : "Subscription destination is not allowed.");
            }
        }
        return message;
    }

    private void authenticate(StompHeaderAccessor accessor) {
        List<String> values = accessor.getNativeHeader(HttpHeaders.AUTHORIZATION);
        if (values == null || values.isEmpty() || !values.get(0).startsWith("Bearer ")) {
            throw new MessagingException("A bearer access token is required.");
        }
        try {
            Jwt jwt = jwtDecoder.decode(values.get(0).substring("Bearer ".length()));
            accessor.setUser(new JwtAuthenticationToken(jwt));
        } catch (RuntimeException exception) {
            throw new MessagingException("The access token is invalid or expired.", exception);
        }
    }

    private void requireRoomMember(String roomId, String userId) {
        String conversationId = roomRepository.findById(roomId)
                .or(() -> roomRepository.findFirstByTitleOrderByCreatedAtAsc(roomId))
                .map(room -> room.getId())
                .orElse(roomId);
        if (!participantRepository.existsByIdConversationIdAndIdUserId(conversationId, userId)) {
            throw new MessagingException("You do not have access to this conversation.");
        }
    }

    private void requireCallParticipant(String callId, String userId) {
        var call = callRepository.findById(callId)
                .orElseThrow(() -> new MessagingException("Call not found."));
        if (!userId.equals(call.getInitiatorId()) && !userId.equals(call.getRecipientId())) {
            throw new MessagingException("You do not have access to this call.");
        }
    }
}
