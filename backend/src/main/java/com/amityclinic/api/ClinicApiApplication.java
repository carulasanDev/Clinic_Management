package com.amityclinic.api;

import com.amityclinic.api.auth.ClinicUserRepository;
import com.amityclinic.api.auth.ClinicUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.UUID;

@SpringBootApplication
public class ClinicApiApplication {
    public static void main(String[] args) {
        SpringApplication.run(ClinicApiApplication.class, args);
    }

    @Bean
    ApplicationRunner provisionClinicUser(
            ClinicUserRepository users,
            PasswordEncoder passwordEncoder,
            @Value("${CLINIC_ADMIN_USERNAME:}") String username,
            @Value("${CLINIC_ADMIN_PASSWORD:}") String password) {
        return args -> {
            if (username.isBlank() || password.isBlank()) {
                throw new IllegalStateException("Set CLINIC_ADMIN_USERNAME and CLINIC_ADMIN_PASSWORD before starting the clinic API.");
            }
            if (password.length() < 12) {
                throw new IllegalStateException("CLINIC_ADMIN_PASSWORD must contain at least 12 characters.");
            }
            String passwordHash = passwordEncoder.encode(password);
            ClinicUser user = users.findByUsername(username)
                    .orElseGet(() -> new ClinicUser(UUID.randomUUID(), username, passwordHash, Instant.now()));
            user.setPasswordHash(passwordHash);
            users.save(user);
        };
    }
}
