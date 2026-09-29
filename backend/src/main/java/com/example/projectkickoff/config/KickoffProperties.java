package com.example.projectkickoff.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.util.List;

/**
 * A {@code kickoff.*} konfiguráció. Példa: application-kickoff.example.yml
 */
@ConfigurationProperties(prefix = "kickoff")
public record KickoffProperties(
        @DefaultValue Gitlab gitlab,
        @DefaultValue Mattermost mattermost,
        @DefaultValue Drive drive,
        @DefaultValue Bookstack bookstack,
        @DefaultValue Syncro syncro,
        @DefaultValue("2") int workerThreads
) {

    public record Gitlab(
            @DefaultValue("false") boolean enabled,
            String baseUrl,
            /** Personal/group access token "api" scope-pal. Admin token esetén az e-mail alapú keresés is pontos. */
            String token,
            /** Ez alá a szülőcsoport alá jön létre a projekt csoportja. Üresen: legfelső szintű csoport. */
            Long parentGroupId,
            @DefaultValue("true") boolean createProject,
            @DefaultValue("private") String visibility,
            @DefaultValue("50") int projectManagerAccessLevel,
            @DefaultValue("30") int memberAccessLevel,
            @DefaultValue("20") int viewerAccessLevel
    ) {
    }

    public record Mattermost(
            @DefaultValue("false") boolean enabled,
            String baseUrl,
            /** Bot vagy personal access token. */
            String token,
            String teamId,
            /** Keresés a személyválasztóhoz (PM / tagok) a Mattermost felhasználók közül. */
            @DefaultValue("true") boolean usePersonDirectory
    ) {
    }

    public record Drive(
            @DefaultValue("false") boolean enabled,
            /** Service account JSON kulcsfájl elérési útja. */
            String credentialsFile,
            /** Opcionális: domain-wide delegation esetén ennek a felhasználónak a nevében dolgozik. */
            String impersonateUser,
            /** Ebbe a (Shared Drive-on lévő) mappába jönnek létre a projektmappák. */
            String parentFolderId,
            /** Placeholderek: {key}, {name}, {KEY} */
            @DefaultValue("{KEY} - {name}") String folderNamePattern,
            @DefaultValue({}) List<String> subfolders,
            @DefaultValue("false") boolean sendNotificationEmail
    ) {
    }

    public record Bookstack(
            @DefaultValue("false") boolean enabled,
            String baseUrl,
            String tokenId,
            String tokenSecret,
            /** Opcionális polc, amire a projekt könyve kerül. */
            Long shelfId,
            @DefaultValue("Projekt áttekintés") String pageName,
            /** Markdown sablon. Placeholderek: {name}, {key}, {description}, {pm}, {members}, {links} */
            @DefaultValue("# {name}\n\n{description}\n\n**Projektvezető:** {pm}\n\n## Csapat\n\n{members}\n\n## Linkek\n\n{links}\n")
            String pageTemplate,
            /** Projekt szerepkör létrehozása és a tagok hozzárendelése. */
            @DefaultValue("true") boolean createRole,
            /** true: a könyvet csak a projekt szerepkör (és adminok) látják. */
            @DefaultValue("false") boolean restrictToMembers
    ) {
    }

    public record Syncro(
            @DefaultValue("false") boolean enabled,
            /** Csak a beépített REST gateway használja. Ha a modul a Syncro-ba épül, saját SyncroGateway bean kell. */
            String baseUrl,
            @DefaultValue("/api/projects/kickoff") String path,
            String token
    ) {
    }
}
