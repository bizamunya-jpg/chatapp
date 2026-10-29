package com.subspring.chatapp.backend.config;

import com.subspring.chatapp.backend.repositories.CallRepository;
import com.subspring.chatapp.backend.repositories.ConversationParticipantRepository;
import com.subspring.chatapp.backend.repositories.RoomRepository;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WebSocketAuthenticationInterceptorTests {

    @Test
    void authenticatesConnectAndRetainsPrincipalOnTheMessage() {
        JwtDecoder jwtDecoder = mock(JwtDecoder.class);
        Jwt jwt = Jwt.withTokenValue("valid-token")
                .header("alg", "HS256")
                .subject("user-1")
                .build();
        when(jwtDecoder.decode("valid-token")).thenReturn(jwt);

        WebSocketAuthenticationInterceptor interceptor = new WebSocketAuthenticationInterceptor(
                jwtDecoder,
                mock(ConversationParticipantRepository.class),
                mock(RoomRepository.class),
                mock(CallRepository.class)
        );
        StompHeaderAccessor headers = StompHeaderAccessor.create(StompCommand.CONNECT);
        headers.addNativeHeader("Authorization", "Bearer valid-token");
        headers.setLeaveMutable(true);
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());

        Message<?> authenticated = interceptor.preSend(message, mock(MessageChannel.class));
        StompHeaderAccessor authenticatedHeaders = MessageHeaderAccessor.getAccessor(
                authenticated,
                StompHeaderAccessor.class
        );

        assertEquals("user-1", authenticatedHeaders.getUser().getName());
    }

    @Test
    void rejectsConnectWithoutBearerToken() {
        WebSocketAuthenticationInterceptor interceptor = new WebSocketAuthenticationInterceptor(
                mock(JwtDecoder.class),
                mock(ConversationParticipantRepository.class),
                mock(RoomRepository.class),
                mock(CallRepository.class)
        );
        StompHeaderAccessor headers = StompHeaderAccessor.create(StompCommand.CONNECT);
        headers.setLeaveMutable(true);
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());

        assertThrows(
                MessagingException.class,
                () -> interceptor.preSend(message, mock(MessageChannel.class))
        );
    }
}
