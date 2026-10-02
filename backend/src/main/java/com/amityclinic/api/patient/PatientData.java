package com.amityclinic.api.patient;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record PatientData(
        UUID id,
        Instant createdAt,
        String name,
        String age,
        String dob,
        String sex,
        String phone,
        String complaint,
        String triage,
        String status,
        Map<String, String> vitals,
        Map<String, String> soap,
        List<Medication> medications,
        boolean demo) {
    public PatientData {
        vitals = vitals == null ? Map.of() : Map.copyOf(vitals);
        soap = soap == null ? Map.of() : Map.copyOf(soap);
        medications = medications == null ? List.of() : List.copyOf(medications);
    }

    public PatientData withIdAndCreatedAt(UUID patientId, Instant timestamp) {
        return new PatientData(patientId, timestamp, name, age, dob, sex, phone, complaint, triage, status,
                vitals, soap, medications, false);
    }

    public record Medication(String name, String dose, String frequency, String duration) {}
}
