package com.subspring.chatapp.backend.config;

import java.net.URI;

import javax.sql.DataSource;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.util.StringUtils;

@Configuration
public class DatabaseConfiguration {

    @Bean
    DataSource dataSource(Environment environment) {
        String jdbcUrl = environment.getProperty("spring.datasource.url");
        String username = environment.getProperty("spring.datasource.username");
        String password = environment.getProperty("spring.datasource.password");

        if (!StringUtils.hasText(jdbcUrl)) {
            String databaseUrl = environment.getProperty("DATABASE_URL");
            if (!StringUtils.hasText(databaseUrl)) {
                throw new IllegalStateException(
                        "Set DATABASE_URL or SPRING_DATASOURCE_URL to connect the backend to PostgreSQL."
                );
            }

            URI uri = URI.create(databaseUrl);
            if (!"postgres".equals(uri.getScheme()) && !"postgresql".equals(uri.getScheme())) {
                throw new IllegalArgumentException("DATABASE_URL must use the postgres or postgresql scheme.");
            }
            if (!StringUtils.hasText(uri.getHost()) || !StringUtils.hasText(uri.getPath())) {
                throw new IllegalArgumentException("DATABASE_URL must include a PostgreSQL host and database name.");
            }

            String port = uri.getPort() == -1 ? "" : ":" + uri.getPort();
            jdbcUrl = "jdbc:postgresql://" + uri.getHost() + port + uri.getRawPath();
            if (StringUtils.hasText(uri.getRawQuery())) {
                jdbcUrl += "?" + uri.getRawQuery();
            }

            if (uri.getUserInfo() != null) {
                String[] credentials = uri.getUserInfo().split(":", 2);
                if (!StringUtils.hasText(username)) {
                    username = credentials[0];
                }
                if (credentials.length == 2 && !StringUtils.hasText(password)) {
                    password = credentials[1];
                }
            }
        }

        return DataSourceBuilder.create()
                .type(HikariDataSource.class)
                .url(jdbcUrl)
                .username(username)
                .password(password)
                .build();
    }
}
