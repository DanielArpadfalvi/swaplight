package com.example.projectkickoff.api;

import com.example.projectkickoff.domain.KickoffStatus;
import com.example.projectkickoff.domain.KickoffStep;
import com.example.projectkickoff.domain.MemberRole;
import com.example.projectkickoff.domain.ProjectKickoff;
import com.example.projectkickoff.domain.StepStatus;
import com.example.projectkickoff.domain.StepType;
import com.example.projectkickoff.service.Slugs;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Set;

/** A REST API be- és kimeneti objektumai. */
public final class KickoffDtos {

    private KickoffDtos() {
    }

    public record CreateKickoffRequest(
            @NotBlank @Size(max = 100) String name,
            @NotBlank @Pattern(regexp = Slugs.KEY_REGEX,
                    message = "3-50 karakter: kisbetű, szám, kötőjel; betűvel vagy számmal kezdődik és végződik")
            String projectKey,
            @Size(max = 1000) String description,
            @NotBlank @Email String projectManagerEmail,
            @Valid @Size(max = 200) List<MemberRequest> members,
            /** A futtatandó integrációk. Üresen/null: az összes bekapcsolt. */
            Set<StepType> integrations,
            boolean privateChannel
    ) {
    }

    public record MemberRequest(
            @NotBlank @Email String email,
            /** MEMBER vagy VIEWER (a projektvezetőt külön mezőben kell megadni). */
            @NotNull MemberRole role
    ) {
    }

    public record AddMembersRequest(@NotNull @Size(min = 1, max = 200) @Valid List<MemberRequest> members) {
    }

    public record IntegrationOption(StepType type, String label) {
    }

    public record KickoffOptions(List<IntegrationOption> integrations, String keyPattern) {
    }

    public record MemberView(String email, MemberRole role) {
    }

    public record StepView(Long id, StepType type, String label, StepStatus status, String externalId, String url,
                           String message, int attempts, Instant startedAt, Instant finishedAt) {

        static StepView of(KickoffStep s) {
            return new StepView(s.getId(), s.getType(), s.getType().label(), s.getStatus(), s.getExternalId(),
                    s.getUrl(), s.getMessage(), s.getAttempts(), s.getStartedAt(), s.getFinishedAt());
        }
    }

    public record KickoffView(Long id, String projectKey, String name, String description,
                              String projectManagerEmail, boolean privateChannel, KickoffStatus status,
                              String createdBy, Instant createdAt, Instant updatedAt,
                              List<MemberView> members, List<StepView> steps) {

        public static KickoffView of(ProjectKickoff k) {
            return new KickoffView(k.getId(), k.getProjectKey(), k.getName(), k.getDescription(),
                    k.getProjectManagerEmail(), k.isPrivateChannel(), k.getStatus(), k.getCreatedBy(),
                    k.getCreatedAt(), k.getUpdatedAt(),
                    k.getMembers().stream().map(m -> new MemberView(m.getEmail(), m.getRole())).toList(),
                    k.getSteps().stream().map(StepView::of).toList());
        }
    }

    public record KickoffSummary(Long id, String projectKey, String name, String projectManagerEmail,
                                 KickoffStatus status, Instant createdAt) {

        public static KickoffSummary of(ProjectKickoff k) {
            return new KickoffSummary(k.getId(), k.getProjectKey(), k.getName(), k.getProjectManagerEmail(),
                    k.getStatus(), k.getCreatedAt());
        }
    }

    public record KeyAvailability(String projectKey, boolean available) {
    }

    public record ErrorResponse(String message, List<String> details) {
    }
}
