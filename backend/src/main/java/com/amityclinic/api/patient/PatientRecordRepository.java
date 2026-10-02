package com.amityclinic.api.patient;

import com.amityclinic.api.auth.ClinicUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PatientRecordRepository extends JpaRepository<PatientRecord, UUID> {
    List<PatientRecord> findAllByOwnerOrderByCreatedAtDesc(ClinicUser owner);
    Optional<PatientRecord> findByIdAndOwner(UUID id, ClinicUser owner);
    boolean existsByIdAndOwnerNot(UUID id, ClinicUser owner);
}
