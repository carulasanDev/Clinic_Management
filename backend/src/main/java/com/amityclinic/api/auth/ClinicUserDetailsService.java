package com.amityclinic.api.auth;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class ClinicUserDetailsService implements UserDetailsService {
    private final ClinicUserRepository users;

    public ClinicUserDetailsService(ClinicUserRepository users) {
        this.users = users;
    }

    @Override
    public UserDetails loadUserByUsername(String username) {
        ClinicUser user = users.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("Clinic account was not found."));
        return User.withUsername(user.getUsername())
                .password(user.getPasswordHash())
                .roles("CLINIC")
                .build();
    }
}
