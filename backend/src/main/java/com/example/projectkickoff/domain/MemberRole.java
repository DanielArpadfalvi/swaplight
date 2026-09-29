package com.example.projectkickoff.domain;

/**
 * Projekt szerepkör. Az egyes rendszerekben ez így képeződik le:
 * <pre>
 *                   GitLab       Mattermost      Drive    BookStack
 * PROJECT_MANAGER   Owner        channel admin   writer   projekt szerepkör
 * MEMBER            Developer    tag             writer   projekt szerepkör
 * VIEWER            Reporter     tag             reader   projekt szerepkör
 * </pre>
 * (A GitLab szintek konfigurálhatók.)
 */
public enum MemberRole {
    PROJECT_MANAGER,
    MEMBER,
    VIEWER
}
