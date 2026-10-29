package com.subspring.chatapp.backend.controllers;

import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.subspring.chatapp.backend.entities.Call;
import com.subspring.chatapp.backend.repositories.CallRepository;
import com.subspring.chatapp.backend.repositories.CallParticipantRepository;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/calls")
public class CallInboxController {
    private final CallRepository callRepository;
    private final CallParticipantRepository callParticipantRepository;

    public CallInboxController(CallRepository callRepository, CallParticipantRepository callParticipantRepository) {
        this.callRepository = callRepository;
        this.callParticipantRepository = callParticipantRepository;
    }

    @GetMapping("/incoming")
    public List<Call> listIncomingCalls(@AuthenticationPrincipal Jwt jwt) {
        List<Call> directCalls = callRepository.findByRecipientIdAndStatusInOrderByStartedAtDesc(
                jwt.getSubject(),
                List.of("RINGING", "ACCEPTED")
        ).stream()
                .filter(call -> !call.getInitiatorId().equals(jwt.getSubject()))
                .toList();
        List<Call> groupCalls = callParticipantRepository.findByIdUserIdAndStatusIn(
                        jwt.getSubject(), List.of("RINGING"))
                .stream()
                .map(participant -> callRepository.findById(participant.getId().getCallId()).orElse(null))
                .filter(call -> call != null && List.of("RINGING", "ACCEPTED").contains(call.getStatus()))
                .toList();
        return java.util.stream.Stream.concat(directCalls.stream(), groupCalls.stream())
                .collect(Collectors.toMap(Call::getId, Function.identity(), (first, ignored) -> first))
                .values().stream()
                .toList();
    }
}
