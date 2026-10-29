package com.subspring.chatapp.backend.services;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Arrays;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

@Service
public class AttachmentStorageService {
    private final Path storageRoot;
    private final long maxSize;
    private final Set<String> allowedTypes;
    private final S3Client s3Client;
    private final String bucket;

    public AttachmentStorageService(
            @Value("${app.files.storage-root}") String storageRoot,
            @Value("${app.files.max-size-bytes}") long maxSize,
            @Value("${app.files.allowed-content-types}") String allowedTypes,
            @Value("${app.files.r2.enabled:false}") boolean r2Enabled,
            @Value("${app.files.r2.bucket:}") String bucket,
            ObjectProvider<S3Client> s3ClientProvider
    ) {
        this.storageRoot = Path.of(storageRoot).toAbsolutePath().normalize();
        this.maxSize = maxSize;
        this.allowedTypes = Arrays.stream(allowedTypes.split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
        if (maxSize < 1 || this.allowedTypes.isEmpty()) {
            throw new IllegalStateException("File size limit and allowed content types must be configured.");
        }
        this.s3Client = r2Enabled ? s3ClientProvider.getIfAvailable() : null;
        this.bucket = bucket;
        if (r2Enabled && (this.s3Client == null || !StringUtils.hasText(bucket))) {
            throw new IllegalStateException("R2 requires a configured S3 client and R2_BUCKET.");
        }
    }

    public StoredFile store(MultipartFile upload) {
        if (upload == null || upload.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An attachment file is required.");
        }
        if (upload.getSize() > maxSize) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Attachment exceeds the configured size limit.");
        }
        String filename = safeFilename(upload.getOriginalFilename());
        String declaredType = upload.getContentType();
        if (!StringUtils.hasText(declaredType) || !allowedTypes.contains(declaredType)) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Attachment content type is not allowed.");
        }

        try {
            byte[] content = upload.getBytes();
            if (content.length > maxSize || !matchesContentType(declaredType, content)) {
                throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Attachment content does not match its content type.");
            }
            String storageKey = UUID.randomUUID().toString();
            if (s3Client != null) {
                s3Client.putObject(
                        PutObjectRequest.builder()
                                .bucket(bucket)
                                .key(storageKey)
                                .contentType(declaredType)
                                .build(),
                        RequestBody.fromBytes(content)
                );
            } else {
                Files.createDirectories(storageRoot);
                Path file = storageRoot.resolve(storageKey).normalize();
                if (!file.getParent().equals(storageRoot)) {
                    throw new IllegalStateException("Generated attachment path escaped the storage directory.");
                }
                Files.write(file, content, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            }
            return new StoredFile(storageKey, filename, declaredType, content.length);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Attachment could not be stored.", exception);
        } catch (SdkClientException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Attachment could not be stored in R2.", exception);
        }
    }

    public Resource load(String storageKey) {
        if (s3Client != null) {
            try {
                byte[] content = s3Client.getObjectAsBytes(GetObjectRequest.builder()
                        .bucket(bucket)
                        .key(storageKey)
                        .build()).asByteArray();
                return new ByteArrayResource(content);
            } catch (NoSuchKeyException exception) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment file not found.", exception);
            } catch (SdkClientException exception) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Attachment could not be loaded from R2.", exception);
            }
        }
        Path file = storageRoot.resolve(storageKey).normalize();
        if (!file.getParent().equals(storageRoot) || !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment file not found.");
        }
        return new FileSystemResource(file);
    }

    public void delete(String storageKey) {
        if (s3Client != null) {
            try {
                s3Client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(storageKey).build());
                return;
            } catch (SdkClientException exception) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Attachment could not be removed from R2.", exception);
            }
        }
        try {
            Path file = storageRoot.resolve(storageKey).normalize();
            if (!file.getParent().equals(storageRoot)) {
                throw new IllegalStateException("Attachment path escaped the storage directory.");
            }
            Files.deleteIfExists(file);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Attachment could not be removed.", exception);
        }
    }

    private String safeFilename(String originalFilename) {
        if (!StringUtils.hasText(originalFilename) || originalFilename.length() > 255) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A filename of at most 255 characters is required.");
        }
        String normalized = originalFilename.replace('\\', '/');
        String filename = normalized.substring(normalized.lastIndexOf('/') + 1).trim();
        if (filename.isEmpty() || filename.contains("\0")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Attachment filename is invalid.");
        }
        return filename;
    }

    private boolean matchesContentType(String contentType, byte[] content) {
        return switch (contentType) {
            case "image/jpeg" -> startsWith(content, 0xFF, 0xD8, 0xFF);
            case "image/png" -> startsWith(content, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
            case "image/gif" -> startsWithAscii(content, "GIF87a") || startsWithAscii(content, "GIF89a");
            case "image/webp" -> startsWithAscii(content, "RIFF")
                    && content.length >= 12
                    && new String(content, 8, 4, StandardCharsets.US_ASCII).equals("WEBP");
            case "application/pdf" -> startsWithAscii(content, "%PDF-");
            case "text/plain" -> isUtf8Text(content);
            default -> false;
        };
    }

    private boolean startsWith(byte[] content, int... signature) {
        if (content.length < signature.length) {
            return false;
        }
        for (int index = 0; index < signature.length; index++) {
            if ((content[index] & 0xFF) != signature[index]) {
                return false;
            }
        }
        return true;
    }

    private boolean startsWithAscii(byte[] content, String signature) {
        byte[] expected = signature.getBytes(StandardCharsets.US_ASCII);
        return content.length >= expected.length
                && Arrays.equals(Arrays.copyOf(content, expected.length), expected);
    }

    private boolean isUtf8Text(byte[] content) {
        for (byte value : content) {
            if (value == 0) {
                return false;
            }
        }
        try {
            StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(content));
            return true;
        } catch (CharacterCodingException exception) {
            return false;
        }
    }

    public record StoredFile(String storageKey, String filename, String contentType, long sizeBytes) {
    }
}
