package com.amityclinic.api.profile;

public record DoctorProfile(
        String fullName,
        String license,
        String specialty,
        String clinicName,
        String contact,
        String bio,
        String photo,
        String signature) {
    public static DoctorProfile empty() {
        return new DoctorProfile("", "", "", "Amity Medical Clinic", "", "", "", "");
    }
}
