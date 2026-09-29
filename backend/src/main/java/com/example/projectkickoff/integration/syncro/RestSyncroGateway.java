package com.example.projectkickoff.integration.syncro;

import com.example.projectkickoff.config.KickoffProperties;
import org.springframework.web.client.RestClient;

/**
 * A Syncro REST API hívása: {@code PUT {baseUrl}{path}/{projectKey}} a {@link SyncroProjectCommand} JSON-nel,
 * válaszként {@code {"id": "...", "url": "..."}}.
 *
 * <p>A Syncro oldalon ehhez egy upsert végpont kell; ha más a szerződés, itt kell átírni.
 */
public class RestSyncroGateway implements SyncroGateway {

    private final RestClient http;
    private final String path;

    public RestSyncroGateway(RestClient.Builder builder, KickoffProperties.Syncro props) {
        String base = props.baseUrl() != null && props.baseUrl().endsWith("/")
                ? props.baseUrl().substring(0, props.baseUrl().length() - 1)
                : props.baseUrl();
        RestClient.Builder b = builder.baseUrl(base);
        if (props.token() != null && !props.token().isBlank()) {
            b.defaultHeader("Authorization", "Bearer " + props.token());
        }
        this.http = b.build();
        this.path = props.path();
    }

    @Override
    public SyncroProjectRef upsertProject(SyncroProjectCommand command) {
        return http.put()
                .uri(path + "/{key}", command.projectKey())
                .body(command)
                .retrieve()
                .body(SyncroProjectRef.class);
    }
}
