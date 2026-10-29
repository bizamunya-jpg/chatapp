package com.subspring.chatapp.backend.controllers;

import java.security.Principal;
import java.util.Set;

import com.subspring.chatapp.backend.dto.CallSignalRequest;
import com.subspring.chatapp.backend.dto.CallSignalResponse;
import com.subspring.chatapp.backend.entities.Call;
import com.subspring.chatapp.backend.repositories.CallRepository;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
public class CallSignalingController {
    private static final Set<String> SIGNAL_TYPES = Set.of("OFFER", "ANSWER", "ICE_CANDIDATE");
    private final CallRepository callRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public CallSignalingController(CallRepository callRepository, SimpMessagingTemplate messagingTemplate) {
        this.callRepository = callRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/call/{conversationId}")
    public CallSignalResponse signal(
            @DestinationVariable String conversationId,
            @Payload CallSignalRequest request,
            Principal principal
    ) {
        if (principal == null || request == null
                || request.callId() == null
                || request.type() == null
                || !SIGNAL_TYPES.contains(request.type())
                || request.payload() == null
                || request.payload().length() > 64_000) {
            throw new IllegalArgumentException("Invalid call signaling message.");
        }
        Call call = callRepository.findByIdAndConversationId(request.callId(), conversationId)
                .orElseThrow(() -> new IllegalArgumentException("Call not found."));
        String userId = principal.getName();
        if ((!userId.equals(call.getInitiatorId()) && !userId.equals(call.getRecipientId()))
                || !"ACCEPTED".equals(call.getStatus())) {
            throw new IllegalArgumentException("Call signaling is not allowed for this user or call state.");
        }
        CallSignalResponse signal = new CallSignalResponse(
                call.getId(),
                userId,
                request.type(),
                request.payload()
        );
        messagingTemplate.convertAndSend("/topic/call/" + call.getId(), signal);
        return signal;
    }
}
