package com.example.projectkickoff.domain;

/**
 * A projektindítás lépései, végrehajtási sorrendben.
 * A SYNCRO az utolsó, mert az előző lépések linkjeit is megkapja.
 */
public enum StepType {
    GITLAB("GitLab csoport és projekt"),
    MATTERMOST("Mattermost csatorna"),
    DRIVE("Drive mappa"),
    BOOKSTACK("BookStack oldal"),
    SYNCRO("Syncro projekt");

    private final String label;

    StepType(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
