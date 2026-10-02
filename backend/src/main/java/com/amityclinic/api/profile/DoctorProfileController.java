package com.amityclinic.api.profile;

import com.amityclinic.api.auth.ClinicUser;
import com.amityclinic.api.auth.ClinicUserRepository;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.time.Instant;

@RestController
@RequestMapping("/api/profile")
public class DoctorProfileController {
    private final DoctorProfileRepository profiles;
    private final ClinicUserRepository users;

    public DoctorProfileController(DoctorProfileRepository profiles, ClinicUserRepository users) {
        this.profiles = profiles;
        this.users = users;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public DoctorProfile get(Authentication authentication) {
        ClinicUser owner = currentUser(authentication);
        return profiles.findByOwner(owner).map(DoctorProfileEntity::getPayload).orElseGet(DoctorProfile::empty);
    }

    @PutMapping
    @Transactional
    public DoctorProfile save(@RequestBody DoctorProfile profile, Authentication authentication) {
        if (profile == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Profile data is required.");
        }
        validateImage(profile.photo(), "Profile photo");
        validateImage(profile.signature(), "Signature");
        ClinicUser owner = currentUser(authentication);
        DoctorProfileEntity entity = profiles.findByOwner(owner).orElse(null);
        if (entity == null) {
            profiles.save(new DoctorProfileEntity(owner, Instant.now(), profile));
        } else {
            entity.update(Instant.now(), profile);
        }
        return profile;
    }

    private static void validateImage(String dataUrl, String label) {
        if (dataUrl == null || dataUrl.isEmpty()) return;
        if (dataUrl.length() > 2_800_000
                || !(dataUrl.startsWith("data:image/png;base64,") || dataUrl.startsWith("data:image/jpeg;base64,"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + " must be a PNG or JPEG image under 2 MB.");
        }
    }

    private ClinicUser currentUser(Authentication authentication) {
        return users.findByUsername(authentication.getName())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Clinic session is no longer valid."));
    }
}
