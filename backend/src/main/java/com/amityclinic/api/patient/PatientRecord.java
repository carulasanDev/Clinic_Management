package com.amityclinic.api.patient;

import com.amityclinic.api.auth.ClinicUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "patient_records")
public class PatientRecord {
    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private ClinicUser owner;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(nullable = false)
    private long version;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "json")
    private PatientData payload;

    protected PatientRecord() {}

    public PatientRecord(UUID id, ClinicUser owner, Instant createdAt, Instant updatedAt, PatientData payload) {
        this.id = id;
        this.owner = owner;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.payload = payload;
    }

    public void update(Instant timestamp, PatientData data) {
        this.updatedAt = timestamp;
        this.payload = data;
    }

    public UUID getId() { return id; }
    public ClinicUser getOwner() { return owner; }
    public Instant getCreatedAt() { return createdAt; }
    public PatientData getPayload() { return payload; }
}
