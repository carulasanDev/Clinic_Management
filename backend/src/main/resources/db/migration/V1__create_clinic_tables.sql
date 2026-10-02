CREATE TABLE clinic_users (
    id BINARY(16) NOT NULL PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL
);

CREATE TABLE patient_records (
    id BINARY(16) NOT NULL PRIMARY KEY,
    owner_id BINARY(16) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    payload JSON NOT NULL,
    CONSTRAINT fk_patient_records_owner FOREIGN KEY (owner_id) REFERENCES clinic_users (id),
    INDEX idx_patient_records_owner_created (owner_id, created_at)
);

CREATE TABLE doctor_profiles (
    owner_id BINARY(16) NOT NULL PRIMARY KEY,
    updated_at TIMESTAMP(6) NOT NULL,
    payload JSON NOT NULL,
    CONSTRAINT fk_doctor_profiles_owner FOREIGN KEY (owner_id) REFERENCES clinic_users (id)
);
