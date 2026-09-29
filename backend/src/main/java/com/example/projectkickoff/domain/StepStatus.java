package com.example.projectkickoff.domain;

public enum StepStatus {
    PENDING,
    RUNNING,
    /** Sikeres, figyelmeztetés nélkül. */
    SUCCESS,
    /** Létrejött, de pl. valamelyik tagot nem sikerült felvenni. */
    WARNING,
    FAILED,
    /** Az integráció időközben ki lett kapcsolva. */
    SKIPPED;

    public boolean isDone() {
        return this == SUCCESS || this == WARNING || this == SKIPPED;
    }
}
