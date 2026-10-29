package com.subspring.chatapp.backend.config;

import java.net.URI;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

@Configuration
public class AttachmentStorageConfiguration {

    @Bean(destroyMethod = "close")
    @ConditionalOnProperty(name = "app.files.r2.enabled", havingValue = "true")
    S3Client attachmentS3Client(
            @Value("${app.files.r2.endpoint}") String endpoint,
            @Value("${app.files.r2.access-key-id}") String accessKeyId,
            @Value("${app.files.r2.secret-access-key}") String secretAccessKey
    ) {
        if (!StringUtils.hasText(endpoint)
                || !StringUtils.hasText(accessKeyId)
                || !StringUtils.hasText(secretAccessKey)) {
            throw new IllegalStateException(
                    "R2 requires R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY."
            );
        }

        URI endpointUri = URI.create(endpoint);
        if (!"https".equals(endpointUri.getScheme())
                || !StringUtils.hasText(endpointUri.getHost())
                || (StringUtils.hasText(endpointUri.getPath()) && !"/".equals(endpointUri.getPath()))) {
            throw new IllegalArgumentException(
                    "R2_ENDPOINT must be an HTTPS account endpoint URL without a bucket path."
            );
        }

        return S3Client.builder()
                .endpointOverride(endpointUri)
                .region(Region.of("auto"))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(accessKeyId, secretAccessKey)
                ))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build();
    }
}
