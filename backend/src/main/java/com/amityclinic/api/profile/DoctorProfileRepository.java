package com.amityclinic.api.profile;

import com.amityclinic.api.auth.ClinicUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DoctorProfileRepository extends JpaRepository<DoctorProfileEntity, java.util.UUID> {
    Optional<DoctorProfileEntity> findByOwner(ClinicUser owner);
}
