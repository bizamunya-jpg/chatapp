package com.subspring.chatapp.backend.services;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mock.web.MockMultipartFile;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

class AttachmentStorageServiceTest {
    private static final String BUCKET = "chatapp";
    private static final byte[] CONTENT = "attachment test".getBytes(StandardCharsets.UTF_8);

    private HttpServer server;
    private S3Client s3Client;

    @BeforeEach
    void startR2Stub() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String method = exchange.getRequestMethod();
            String path = exchange.getRequestURI().getPath();
            requests.add(method + " " + path);
            if ("GET".equals(method)) {
                exchange.getResponseHeaders().add("Content-Type", "text/plain");
                exchange.sendResponseHeaders(200, CONTENT.length);
                exchange.getResponseBody().write(CONTENT);
            } else if ("PUT".equals(method)) {
                exchange.getResponseHeaders().add("ETag", "\"test-etag\"");
                exchange.sendResponseHeaders(200, -1);
            } else if ("DELETE".equals(method)) {
                exchange.sendResponseHeaders(204, -1);
            } else {
                exchange.sendResponseHeaders(405, -1);
            }
            exchange.close();
        });
        server.start();
        s3Client = S3Client.builder()
                .endpointOverride(URI.create("http://127.0.0.1:" + server.getAddress().getPort()))
                .region(Region.of("auto"))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create("test-access-key", "test-secret-key")
                ))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build();
        requests.clear();
    }

    @AfterEach
    void stopR2Stub() {
        if (s3Client != null) {
            s3Client.close();
        }
        if (server != null) {
            server.stop(0);
        }
    }

    private final List<String> requests = new ArrayList<>();

    @Test
    void storesLoadsAndDeletesAttachmentsInR2() throws IOException {
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        beanFactory.registerSingleton("s3Client", s3Client);
        ObjectProvider<S3Client> clientProvider = beanFactory.getBeanProvider(S3Client.class);
        AttachmentStorageService storage = new AttachmentStorageService(
                Path.of("target/r2-test-uploads").toString(),
                1024,
                "text/plain",
                true,
                BUCKET,
                clientProvider
        );

        AttachmentStorageService.StoredFile stored = storage.store(new MockMultipartFile(
                "file",
                "test.txt",
                "text/plain",
                CONTENT
        ));
        assertArrayEquals(CONTENT, storage.load(stored.storageKey()).getInputStream().readAllBytes());
        storage.delete(stored.storageKey());

        assertEquals(3, requests.size());
        assertTrue(requests.get(0).startsWith("PUT /" + BUCKET + "/" + stored.storageKey()));
        assertTrue(requests.get(1).startsWith("GET /" + BUCKET + "/" + stored.storageKey()));
        assertTrue(requests.get(2).startsWith("DELETE /" + BUCKET + "/" + stored.storageKey()));
    }
}
