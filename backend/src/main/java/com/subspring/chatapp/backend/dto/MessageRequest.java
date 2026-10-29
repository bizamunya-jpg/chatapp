package com.subspring.chatapp.backend.dto;                                                            

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Setter
@Getter
@NoArgsConstructor
public class MessageRequest {

    private String content;
    private String sender;
    private String roomId;
    private String clientMessageId;

    public MessageRequest(String content, String sender, String roomId) {
        this.content = content;
        this.sender = sender;
        this.roomId = roomId;
    }

    public MessageRequest(String content, String sender, String roomId, String clientMessageId) {
        this(content, sender, roomId);
        this.clientMessageId = clientMessageId;
    }
}