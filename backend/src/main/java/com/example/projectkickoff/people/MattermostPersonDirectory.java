package com.example.projectkickoff.people;

import com.example.projectkickoff.integration.mattermost.MattermostClient;

import java.util.List;

public class MattermostPersonDirectory implements PersonDirectory {

    private final MattermostClient client;
    private final String teamId;

    public MattermostPersonDirectory(MattermostClient client, String teamId) {
        this.client = client;
        this.teamId = teamId;
    }

    @Override
    public List<Person> search(String query, int limit) {
        return client.searchUsers(query, teamId, limit).stream()
                .filter(u -> u.email() != null && !u.email().isBlank())
                .map(u -> new Person(u.email(), u.displayName()))
                .toList();
    }
}
