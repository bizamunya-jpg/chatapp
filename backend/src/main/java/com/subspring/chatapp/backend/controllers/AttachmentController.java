package com.subspring.chatapp.backend.controllers;

import java.nio.charset.StandardCharsets;

import com.subspring.chatapp.backend.dto.AttachmentResponse;
import com.subspring.chatapp.backend.entities.Attachment;
import com.subspring.chatapp.backend.entities.Message;
import com.subspring.chatapp.backend.repositories.AttachmentRepository;
import com.subspring.chatapp.backend.repositories.ConversationParticipantRepository;
import com.subspring.chatapp.backend.repositories.MessageRepository;
import com.subspring.chatapp.backend.repositories.RoomRepository;
import com.subspring.chatapp.backend.services.AttachmentStorageService;
import com.subspring.chatapp.backend.services.AttachmentStorageService.StoredFile;
import jakarta.transaction.Transactional;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
public class AttachmentController {
    private final AttachmentStorageService storageService;
    private final RoomRepository roomRepository;
    private final ConversationParticipantRepository participantRepository;
    private final MessageRepository messageRepository;
    private final AttachmentRepository attachmentRepository;

    public AttachmentController(
            AttachmentStorageService storageService,
            RoomRepository roomRepository,
            ConversationParticipantRepository participantRepository,
            MessageRepository messageRepository,
            AttachmentRepository attachmentRepository
    ) {
        this.storageService = storageService;
        this.roomRepository = roomRepository;
        this.participantRepository = participantRepository;
        this.messageRepository = messageRepository;
        this.attachmentRepository = attachmentRepository;
    }

    @PostMapping(
            path = "/conversations/{conversationId}/attachments",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    @Transactional
    public ResponseEntity<AttachmentResponse> upload(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String conversationId,
            @RequestParam("file") MultipartFile upload
    ) {
        requireMembership(conversationId, jwt.getSubject());
        StoredFile storedFile = storageService.store(upload);
        try {
            Message message = new Message();
            message.setConversationId(conversationId);
            message.setSenderId(jwt.getSubject());
            message.setType("FILE");
            Message savedMessage = messageRepository.saveAndFlush(message);

            Attachment attachment = new Attachment();
            attachment.setMessageId(savedMessage.getId());
            attachment.setStorageKey(storedFile.storageKey());
            attachment.setOriginalFilename(storedFile.filename());
            attachment.setMimeType(storedFile.contentType());
            attachment.setSizeBytes(storedFile.sizeBytes());
            Attachment savedAttachment = attachmentRepository.saveAndFlush(attachment);
            return ResponseEntity.status(HttpStatus.CREATED).body(AttachmentResponse.from(savedAttachment));
        } catch (RuntimeException exception) {
            storageService.delete(storedFile.storageKey());
            throw exception;
        }
    }

    @GetMapping("/attachments/{attachmentId}")
    public ResponseEntity<Resource> download(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String attachmentId
    ) {
        Attachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment not found."));
        Message message = messageRepository.findById(attachment.getMessageId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment message not found."));
        requireMembership(message.getConversationId(), jwt.getSubject());
        Resource resource = storageService.load(attachment.getStorageKey());
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(attachment.getMimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(safeDispositionFilename(attachment.getOriginalFilename()), StandardCharsets.UTF_8)
                        .build()
                        .toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(resource);
    }

    @GetMapping("/conversations/{conversationId}/messages/{messageId}/attachment")
    public ResponseEntity<AttachmentResponse> getMessageAttachment(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String conversationId,
            @PathVariable String messageId
    ) {
        requireMembership(conversationId, jwt.getSubject());
        Message message = messageRepository.findByIdAndConversationId(messageId, conversationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found."));
        Attachment attachment = attachmentRepository.findByMessageId(message.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment not found."));
        return ResponseEntity.ok(AttachmentResponse.from(attachment));
    }

    private void requireMembership(String conversationId, String userId) {
        if (!roomRepository.existsById(conversationId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found.");
        }
        if (!participantRepository.existsByIdConversationIdAndIdUserId(conversationId, userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have access to this conversation.");
        }
    }

    private String safeDispositionFilename(String filename) {
        String normalized = filename.replace('\\', '/');
        String baseName = normalized.substring(normalized.lastIndexOf('/') + 1);
        return StringUtils.hasText(baseName) ? baseName : "attachment";
    }
}
