package com.example.projectkickoff.integration.syncro;

import com.example.projectkickoff.domain.MemberRole;
import com.example.projectkickoff.domain.StepType;

import java.util.List;
import java.util.Map;

/**
 * Kapcsolat a Syncro-val.
 *
 * <p><b>Ha a modul magába a Syncro-ba kerül</b>, ezt az interfészt a Syncro belső projekt service-ével
 * kell implementálni (egy {@code @Component}), és akkor a beépített {@link RestSyncroGateway} nem jön létre.
 * Ha a modul külön alkalmazásban fut, a {@link RestSyncroGateway} a Syncro REST API-ját hívja.
 */
public interface SyncroGateway {

    /**
     * Létrehozza vagy (azonos kulcs esetén) frissíti a projektet a Syncro-ban. Idempotensnek kell lennie.
     */
    SyncroProjectRef upsertProject(SyncroProjectCommand command);

    record SyncroProjectCommand(
            String projectKey,
            String name,
            String description,
            String projectManagerEmail,
            List<Member> members,
            /** A létrehozott erőforrások linkjei (GitLab, Mattermost, Drive, BookStack). */
            Map<StepType, String> links
    ) {
    }

    record Member(String email, MemberRole role) {
    }

    record SyncroProjectRef(String id, String url) {
    }
}
