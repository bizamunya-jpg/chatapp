package com.subspring.chatapp.backend.services;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

/**
 * One-time credentials for opening a WebSocket from the browser, which never
 * receives the access token. Tickets are held in memory, matching the in-process
 * STOMP broker: both only work against a single backend instance.
 */
@Service
public class WebSocketTicketService {
    private static final Duration TICKET_TTL = Duration.ofSeconds(60);

    private final Map<String, IssuedTicket> tickets = new ConcurrentHashMap<>();
    private final SecureRandom secureRandom = new SecureRandom();

    public String issue(Jwt jwt) {
        Instant now = Instant.now();
        tickets.values().removeIf(ticket -> !ticket.expiresAt().isAfter(now));

        byte[] value = new byte[32];
        secureRandom.nextBytes(value);
        String ticket = Base64.getUrlEncoder().withoutPadding().encodeToString(value);
        tickets.put(ticket, new IssuedTicket(jwt, now.plus(TICKET_TTL)));
        return ticket;
    }

    public Optional<Jwt> consume(String ticket) {
        IssuedTicket issued = tickets.remove(ticket);
        if (issued == null || !issued.expiresAt().isAfter(Instant.now())) {
            return Optional.empty();
        }
        return Optional.of(issued.jwt());
    }

    private record IssuedTicket(Jwt jwt, Instant expiresAt) {
    }
}
