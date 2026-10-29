package com.subspring.chatapp.backend.config;

import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DatabaseConfigurationTests {

    @Test
    void convertsPrismaPostgresUrlToJdbcWithoutExposingCredentialsInTheUrl() {
        MockEnvironment environment = new MockEnvironment()
                .withProperty(
                        "DATABASE_URL",
                        "postgresql://test-user:test%40pass@db.example.com:5432/postgres?sslmode=require"
                );

        HikariDataSource dataSource = (HikariDataSource) new DatabaseConfiguration().dataSource(environment);
        try {
            assertEquals(
                    "jdbc:postgresql://db.example.com:5432/postgres?sslmode=require",
                    dataSource.getJdbcUrl()
            );
            assertEquals("test-user", dataSource.getUsername());
            assertEquals("test@pass", dataSource.getPassword());
        } finally {
            dataSource.close();
        }
    }
}
