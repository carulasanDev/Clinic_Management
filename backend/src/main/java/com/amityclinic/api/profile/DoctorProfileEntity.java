package com.amityclinic.api.profile;

import com.amityclinic.api.auth.ClinicUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.MapsId;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "doctor_profiles")
public class DoctorProfileEntity {
    @Id
    @Column(name = "owner_id", nullable = false)
    private java.util.UUID ownerId;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @MapsId
    @JoinColumn(name = "owner_id", nullable = false)
    private ClinicUser owner;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "json")
    private DoctorProfile payload;

    protected DoctorProfileEntity() {}

    public DoctorProfileEntity(ClinicUser owner, Instant updatedAt, DoctorProfile payload) {
        this.owner = owner;
        this.updatedAt = updatedAt;
        this.payload = payload;
    }

    public void update(Instant timestamp, DoctorProfile profile) {
        this.updatedAt = timestamp;
        this.payload = profile;
    }

    public DoctorProfile getPayload() { return payload; }
}
