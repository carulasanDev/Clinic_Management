package com.amityclinic.api.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ClinicUserRepository extends JpaRepository<ClinicUser, UUID> {
    Optional<ClinicUser> findByUsername(String username);
}
