package com.example.projectkickoff.service;

import com.example.projectkickoff.domain.MemberRole;
import com.example.projectkickoff.domain.StepType;

import java.util.List;
import java.util.Map;

/**
 * A lépés-kezelők bemenete.
 *
 * @param participants a projektvezető (PROJECT_MANAGER szerepkörrel) és az összes tag
 * @param links        a korábban sikeresen lefutott lépések linkjei (pl. a Syncro ezt kapja meg)
 */
public record ProvisioningContext(
        Long kickoffId,
        String projectKey,
        String name,
        String description,
        String projectManagerEmail,
        boolean privateChannel,
        List<Participant> participants,
        Map<StepType, String> links
) {

    public record Participant(String email, MemberRole role) {
    }

    public List<Participant> members() {
        return participants.stream().filter(p -> p.role() != MemberRole.PROJECT_MANAGER).toList();
    }
}
