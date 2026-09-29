package com.example.projectkickoff.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;

@Embeddable
public class KickoffMember {

    @Column(name = "email", nullable = false, length = 254)
    private String email;

    @Enumerated(EnumType.STRING)
    @Column(name = "member_role", nullable = false, length = 32)
    private MemberRole role;

    protected KickoffMember() {
    }

    public KickoffMember(String email, MemberRole role) {
        this.email = email;
        this.role = role;
    }

    public String getEmail() {
        return email;
    }

    public MemberRole getRole() {
        return role;
    }
}
