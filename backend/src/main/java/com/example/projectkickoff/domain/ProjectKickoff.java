package com.example.projectkickoff.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Egy projektindítási kérés és a lépéseinek állapota.
 */
@Entity
@Table(name = "project_kickoff")
public class ProjectKickoff {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Rövid, URL-barát azonosító (GitLab path, Mattermost csatornanév stb.). */
    @Column(name = "project_key", nullable = false, unique = true, length = 50)
    private String projectKey;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 1000)
    private String description;

    @Column(name = "project_manager_email", nullable = false, length = 254)
    private String projectManagerEmail;

    @Column(name = "private_channel", nullable = false)
    private boolean privateChannel;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private KickoffStatus status = KickoffStatus.PENDING;

    @Column(name = "created_by", length = 254)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private long version;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "project_kickoff_member", joinColumns = @JoinColumn(name = "kickoff_id"))
    @OrderColumn(name = "position")
    private List<KickoffMember> members = new ArrayList<>();

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JoinColumn(name = "kickoff_id", nullable = false)
    @OrderColumn(name = "position")
    private List<KickoffStep> steps = new ArrayList<>();

    protected ProjectKickoff() {
    }

    public ProjectKickoff(String projectKey, String name, String description, String projectManagerEmail,
                          boolean privateChannel, String createdBy) {
        this.projectKey = projectKey;
        this.name = name;
        this.description = description;
        this.projectManagerEmail = projectManagerEmail;
        this.privateChannel = privateChannel;
        this.createdBy = createdBy;
    }

    @PrePersist
    @PreUpdate
    void touch() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    public void addMember(KickoffMember member) {
        members.add(member);
    }

    public boolean hasMember(String email) {
        return projectManagerEmail.equalsIgnoreCase(email)
                || members.stream().anyMatch(m -> m.getEmail().equalsIgnoreCase(email));
    }

    public void addStep(KickoffStep step) {
        steps.add(step);
    }

    public Optional<KickoffStep> findStep(Long stepId) {
        return steps.stream().filter(s -> s.getId().equals(stepId)).findFirst();
    }

    /** A lépések állapota alapján kiszámolja az összesített állapotot. */
    public void recomputeStatus() {
        if (steps.stream().anyMatch(s -> s.getStatus() == StepStatus.RUNNING)) {
            status = KickoffStatus.RUNNING;
        } else if (steps.stream().anyMatch(s -> s.getStatus() == StepStatus.FAILED)) {
            status = KickoffStatus.FAILED;
        } else if (steps.stream().anyMatch(s -> s.getStatus() == StepStatus.PENDING)) {
            status = KickoffStatus.PENDING;
        } else if (steps.stream().anyMatch(s -> s.getStatus() == StepStatus.WARNING
                || s.getStatus() == StepStatus.SKIPPED)) {
            status = KickoffStatus.COMPLETED_WITH_WARNINGS;
        } else {
            status = KickoffStatus.COMPLETED;
        }
    }

    public void setStatus(KickoffStatus status) {
        this.status = status;
    }

    public Long getId() {
        return id;
    }

    public String getProjectKey() {
        return projectKey;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public String getProjectManagerEmail() {
        return projectManagerEmail;
    }

    public boolean isPrivateChannel() {
        return privateChannel;
    }

    public KickoffStatus getStatus() {
        return status;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public List<KickoffMember> getMembers() {
        return members;
    }

    public List<KickoffStep> getSteps() {
        return steps;
    }
}
