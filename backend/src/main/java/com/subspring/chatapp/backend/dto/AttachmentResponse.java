package com.subspring.chatapp.backend.dto;

import com.subspring.chatapp.backend.entities.Attachment;

public record AttachmentResponse(
        String id,
        String messageId,
        String filename,
        String contentType,
        long sizeBytes,
        String downloadUrl
) {
    public static AttachmentResponse from(Attachment attachment) {
        return new AttachmentResponse(
                attachment.getId(),
                attachment.getMessageId(),
                attachment.getOriginalFilename(),
                attachment.getMimeType(),
                attachment.getSizeBytes(),
                "/api/v1/attachments/" + attachment.getId()
        );
    }
}
