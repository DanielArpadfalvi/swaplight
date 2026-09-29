package com.example.projectkickoff.integration.mattermost;

import com.example.projectkickoff.config.KickoffProperties;
import com.example.projectkickoff.integration.HttpErrors;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Vékony kliens a Mattermost REST API v4-hez. */
public class MattermostClient {

    private final RestClient http;
    private final String baseUrl;

    public MattermostClient(RestClient.Builder builder, KickoffProperties.Mattermost props) {
        this.baseUrl = props.baseUrl() != null && props.baseUrl().endsWith("/")
                ? props.baseUrl().substring(0, props.baseUrl().length() - 1)
                : props.baseUrl();
        this.http = builder
                .baseUrl(baseUrl + "/api/v4")
                .defaultHeader("Authorization", "Bearer " + props.token())
                .build();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Team(String id, String name) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Channel(String id, String name, @JsonProperty("display_name") String displayName) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record User(String id, String username, String email,
                       @JsonProperty("first_name") String firstName,
                       @JsonProperty("last_name") String lastName) {

        public String displayName() {
            String full = ((lastName == null ? "" : lastName) + " " + (firstName == null ? "" : firstName)).trim();
            return full.isEmpty() ? username : full;
        }
    }

    public String baseUrl() {
        return baseUrl;
    }

    public Team getTeam(String teamId) {
        return http.get().uri("/teams/{id}", teamId).retrieve().body(Team.class);
    }

    public Optional<Channel> findChannelByName(String teamId, String name) {
        try {
            return Optional.ofNullable(http.get().uri("/teams/{teamId}/channels/name/{name}", teamId, name)
                    .retrieve().body(Channel.class));
        } catch (RestClientResponseException e) {
            if (HttpErrors.isStatus(e, 404)) {
                return Optional.empty();
            }
            throw e;
        }
    }

    public Channel createChannel(String teamId, String name, String displayName, String purpose, boolean privateChannel) {
        return http.post().uri("/channels")
                .body(Map.of(
                        "team_id", teamId,
                        "name", name,
                        "display_name", displayName,
                        "purpose", purpose == null ? "" : purpose,
                        "type", privateChannel ? "P" : "O"))
                .retrieve().body(Channel.class);
    }

    public Optional<User> findUserByEmail(String email) {
        try {
            return Optional.ofNullable(http.get().uri("/users/email/{email}", email).retrieve().body(User.class));
        } catch (RestClientResponseException e) {
            if (HttpErrors.isStatus(e, 404)) {
                return Optional.empty();
            }
            throw e;
        }
    }

    /** Idempotens: ha már tag, a Mattermost nem ad hibát. */
    public void addTeamMember(String teamId, String userId) {
        http.post().uri("/teams/{teamId}/members", teamId)
                .body(Map.of("team_id", teamId, "user_id", userId))
                .retrieve().toBodilessEntity();
    }

    /** Idempotens: ha már tag, a Mattermost nem ad hibát. */
    public void addChannelMember(String channelId, String userId) {
        http.post().uri("/channels/{channelId}/members", channelId)
                .body(Map.of("user_id", userId))
                .retrieve().toBodilessEntity();
    }

    public void makeChannelAdmin(String channelId, String userId) {
        http.put().uri("/channels/{channelId}/members/{userId}/schemeRoles", channelId, userId)
                .body(Map.of("scheme_admin", true, "scheme_user", true))
                .retrieve().toBodilessEntity();
    }

    public List<User> searchUsers(String term, String teamId, int limit) {
        List<User> users = http.post().uri("/users/search")
                .body(Map.of("term", term, "team_id", teamId == null ? "" : teamId,
                        "allow_inactive", false, "limit", limit))
                .retrieve()
                .body(new ParameterizedTypeReference<List<User>>() {
                });
        return users == null ? List.of() : users;
    }
}
