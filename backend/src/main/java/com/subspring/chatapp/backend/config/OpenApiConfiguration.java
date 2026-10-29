package com.subspring.chatapp.backend.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import org.springframework.context.annotation.Configuration;

@Configuration
@OpenAPIDefinition(
        info = @Info(
                title = "Chat App Backend API",
                version = "v1",
                description = "REST API for rooms and messages. STOMP WebSocket endpoint: /ws."
        )
)
public class OpenApiConfiguration {
}
