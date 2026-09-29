package com.example.projectkickoff.integration;

import java.util.List;

public record StepResult(String externalId, String url, List<String> warnings) {

    public StepResult {
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }
}
