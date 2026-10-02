package com.amityclinic.api.patient;

import com.amityclinic.api.auth.ClinicUser;
import com.amityclinic.api.auth.ClinicUserRepository;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/patients")
public class PatientController {
    private static final List<String> STATUSES = List.of("Waiting", "In Consultation", "Completed");
    private static final List<String> TRIAGE = List.of("Routine", "Priority", "Urgent");

    private final PatientRecordRepository records;
    private final ClinicUserRepository users;

    public PatientController(PatientRecordRepository records, ClinicUserRepository users) {
        this.records = records;
        this.users = users;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<PatientData> list(Authentication authentication) {
        ClinicUser owner = currentUser(authentication);
        return records.findAllByOwnerOrderByCreatedAtDesc(owner).stream().map(PatientRecord::getPayload).toList();
    }

    @PutMapping("/{id}")
    @Transactional
    public PatientData upsert(
            @PathVariable UUID id,
            @Valid @RequestBody PatientData request,
            Authentication authentication) {
        if (request.id() != null && !request.id().equals(id)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Patient ID in the URL and body must match.");
        }
        if (request.name() == null || request.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Patient name is required.");
        }
        if (!STATUSES.contains(request.status())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a valid visit status.");
        }
        if (!TRIAGE.contains(request.triage())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a valid triage priority.");
        }
        ClinicUser owner = currentUser(authentication);
        if (records.existsByIdAndOwnerNot(id, owner)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Patient record was not found.");
        }
        PatientRecord record = records.findByIdAndOwner(id, owner).orElse(null);
        Instant now = Instant.now();
        Instant createdAt = record == null ? (request.createdAt() == null ? now : request.createdAt()) : record.getCreatedAt();
        PatientData stored = request.withIdAndCreatedAt(id, createdAt);
        if (record == null) {
            records.save(new PatientRecord(id, owner, createdAt, now, stored));
        } else {
            record.update(now, stored);
        }
        return stored;
    }

    private ClinicUser currentUser(Authentication authentication) {
        return users.findByUsername(authentication.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Clinic session is no longer valid."));
    }
}
