package com.example.projectkickoff.integration.gitlab;

import com.example.projectkickoff.config.KickoffProperties;
import com.example.projectkickoff.integration.HttpErrors;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Vékony kliens a GitLab REST API v4-hez.
 * A "{path}" URI változókat a RestClient szigorúan kódolja, így a "szulo/projekt" útvonalból "szulo%2Fprojekt" lesz,
 * ahogy a GitLab elvárja.
 */
public class GitLabClient {

    private final RestClient http;

    public GitLabClient(RestClient.Builder builder, KickoffProperties.Gitlab props) {
        this.http = builder
                .baseUrl(stripSlash(props.baseUrl()) + "/api/v4")
                .defaultHeader("PRIVATE-TOKEN", props.token())
                .build();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Group(long id, String path, @JsonProperty("full_path") String fullPath,
                        @JsonProperty("web_url") String webUrl) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Project(long id, String path, @JsonProperty("web_url") String webUrl) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record User(long id, String username, String email, @JsonProperty("public_email") String publicEmail) {
    }

    public Group getGroup(long id) {
        return http.get().uri("/groups/{id}", id).retrieve().body(Group.class);
    }

    public Optional<Group> findGroupByFullPath(String fullPath) {
        try {
            return Optional.ofNullable(http.get().uri("/groups/{path}", fullPath).retrieve().body(Group.class));
        } catch (RestClientResponseException e) {
            if (HttpErrors.isStatus(e, 404)) {
                return Optional.empty();
            }
            throw e;
        }
    }

    public Group createGroup(String name, String path, Long parentId, String visibility, String description) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("path", path);
        body.put("visibility", visibility);
        if (parentId != null) {
            body.put("parent_id", parentId);
        }
        if (description != null) {
            body.put("description", description);
        }
        return http.post().uri("/groups").body(body).retrieve().body(Group.class);
    }

    public Optional<Project> findProjectByFullPath(String fullPath) {
        try {
            return Optional.ofNullable(http.get().uri("/projects/{path}", fullPath).retrieve().body(Project.class));
        } catch (RestClientResponseException e) {
            if (HttpErrors.isStatus(e, 404)) {
                return Optional.empty();
            }
            throw e;
        }
    }

    public Project createProject(String name, String path, long namespaceId, String visibility, String description) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("path", path);
        body.put("namespace_id", namespaceId);
        body.put("visibility", visibility);
        body.put("initialize_with_readme", true);
        if (description != null) {
            body.put("description", description);
        }
        return http.post().uri("/projects").body(body).retrieve().body(Project.class);
    }

    /**
     * Felhasználó keresése e-mail alapján. Admin tokennel a privát e-mail címre is talál,
     * egyébként csak a publikus e-mail címre.
     */
    public Optional<User> findUserByEmail(String email) {
        List<User> users = http.get()
                .uri(b -> b.path("/users").queryParam("search", "{email}").build(email))
                .retrieve()
                .body(new ParameterizedTypeReference<List<User>>() {
                });
        if (users == null || users.isEmpty()) {
            return Optional.empty();
        }
        return users.stream()
                .filter(u -> email.equalsIgnoreCase(u.email()) || email.equalsIgnoreCase(u.publicEmail()))
                .findFirst()
                .or(() -> users.size() == 1 ? Optional.of(users.get(0)) : Optional.empty());
    }

    /** Tag felvétele a csoportba; ha már tag, a jogosultsági szintjét állítja be. */
    public void addOrUpdateGroupMember(long groupId, long userId, int accessLevel) {
        try {
            http.post().uri("/groups/{id}/members", groupId)
                    .body(Map.of("user_id", userId, "access_level", accessLevel))
                    .retrieve().toBodilessEntity();
        } catch (RestClientResponseException e) {
            if (!HttpErrors.isStatus(e, 409)) {
                throw e;
            }
            http.put().uri("/groups/{id}/members/{userId}", groupId, userId)
                    .body(Map.of("access_level", accessLevel))
                    .retrieve().toBodilessEntity();
        }
    }

    static String stripSlash(String url) {
        return url != null && url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
