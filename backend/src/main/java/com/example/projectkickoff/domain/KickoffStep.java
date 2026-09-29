package com.example.projectkickoff.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "project_kickoff_step")
public class KickoffStep {

    private static final int MESSAGE_MAX = 4000;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "step_type", nullable = false, length = 32)
    private StepType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private StepStatus status = StepStatus.PENDING;

    /** A létrehozott erőforrás azonosítója a külső rendszerben (pl. GitLab group id). */
    @Column(name = "external_id", length = 255)
    private String externalId;

    /** Link a létrehozott erőforrásra. */
    @Column(length = 1000)
    private String url;

    /** Hibaüzenet vagy figyelmeztetések (soronként egy). */
    @Column(length = MESSAGE_MAX)
    private String message;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    protected KickoffStep() {
    }

    public KickoffStep(StepType type) {
        this.type = type;
    }

    public void markRunning() {
        status = StepStatus.RUNNING;
        attempts++;
        startedAt = Instant.now();
        finishedAt = null;
        message = null;
    }

    public void markFinished(StepStatus status, String externalId, String url, String message) {
        this.status = status;
        if (externalId != null) {
            this.externalId = externalId;
        }
        if (url != null) {
            this.url = url;
        }
        this.message = truncate(message);
        this.finishedAt = Instant.now();
    }

    /** Újrafuttatásra jelöli. Az externalId/url megmarad (a kezelők úgyis "find or create" alapon dolgoznak). */
    public void resetToPending() {
        status = StepStatus.PENDING;
        finishedAt = null;
    }

    private static String truncate(String s) {
        if (s == null || s.length() <= MESSAGE_MAX) {
            return s;
        }
        return s.substring(0, MESSAGE_MAX - 3) + "...";
    }

    public Long getId() {
        return id;
    }

    public StepType getType() {
        return type;
    }

    public StepStatus getStatus() {
        return status;
    }

    public String getExternalId() {
        return externalId;
    }

    public String getUrl() {
        return url;
    }

    public String getMessage() {
        return message;
    }

    public int getAttempts() {
        return attempts;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public Instant getFinishedAt() {
        return finishedAt;
    }
}
