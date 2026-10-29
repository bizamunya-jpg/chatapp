package com.subspring.chatapp.backend.services;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.JsonNode;

import java.net.http.HttpClient;
import java.time.Duration;

@Component
public class OAuthProviderClient {
    private final RestClient restClient;

    public OAuthProviderClient() {
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofSeconds(10));
        restClient = RestClient.builder().requestFactory(requestFactory).build();
    }

    public OAuthIdentity verify(String provider, String accessToken) {
        try {
            return switch (provider) {
                case "google" -> verifyGoogle(accessToken);
                case "github" -> verifyGitHub(accessToken);
                default -> throw new IllegalArgumentException("Unsupported OAuth provider.");
            };
        } catch (RestClientResponseException exception) {
            throw new BadCredentialsException("The provider access token is invalid.", exception);
        } catch (ResourceAccessException exception) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Could not verify the provider account. Please try again.",
                    exception
            );
        }
    }

    private OAuthIdentity verifyGoogle(String accessToken) {
        JsonNode profile = restClient.get()
                .uri("https://openidconnect.googleapis.com/v1/userinfo")
                .headers(headers -> headers.setBearerAuth(accessToken))
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .body(JsonNode.class);
        if (profile == null
                || !profile.path("email_verified").asBoolean(false)
                || !hasText(profile.path("sub").asText())
                || !hasText(profile.path("email").asText())) {
            throw new BadCredentialsException("The Google account has no verified email address.");
        }

        String displayName = profile.path("name").asText("");
        return new OAuthIdentity(
                "google",
                profile.path("sub").asText(),
                profile.path("email").asText(),
                hasText(displayName) ? displayName : profile.path("email").asText(),
                null
        );
    }

    private OAuthIdentity verifyGitHub(String accessToken) {
        JsonNode profile = restClient.get()
                .uri("https://api.github.com/user")
                .headers(headers -> {
                    headers.setBearerAuth(accessToken);
                    headers.set(HttpHeaders.ACCEPT, "application/vnd.github+json");
                    headers.set("X-GitHub-Api-Version", "2022-11-28");
                })
                .retrieve()
                .body(JsonNode.class);
        if (profile == null || !profile.path("id").isNumber()) {
            throw new BadCredentialsException("The GitHub account could not be verified.");
        }

        JsonNode emails = restClient.get()
                .uri("https://api.github.com/user/emails")
                .headers(headers -> {
                    headers.setBearerAuth(accessToken);
                    headers.set(HttpHeaders.ACCEPT, "application/vnd.github+json");
                    headers.set("X-GitHub-Api-Version", "2022-11-28");
                })
                .retrieve()
                .body(JsonNode.class);
        String email = null;
        if (emails != null && emails.isArray()) {
            for (JsonNode candidate : emails) {
                if (candidate.path("primary").asBoolean(false)
                        && candidate.path("verified").asBoolean(false)) {
                    email = candidate.path("email").asText(null);
                    break;
                }
            }
        }
        if (!hasText(email)) {
            throw new BadCredentialsException("The GitHub account has no verified primary email address.");
        }

        String displayName = profile.path("name").asText("");
        String username = profile.path("login").asText("");
        return new OAuthIdentity(
                "github",
                profile.path("id").asText(),
                email,
                hasText(displayName) ? displayName : username,
                username
        );
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
