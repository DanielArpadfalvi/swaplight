package com.example.projectkickoff.integration.mattermost;

import com.example.projectkickoff.config.KickoffProperties;
import com.example.projectkickoff.domain.MemberRole;
import com.example.projectkickoff.domain.StepType;
import com.example.projectkickoff.integration.HttpErrors;
import com.example.projectkickoff.integration.StepHandler;
import com.example.projectkickoff.integration.StepResult;
import com.example.projectkickoff.service.ProvisioningContext;
import com.example.projectkickoff.service.ProvisioningContext.Participant;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Mattermost csatorna létrehozása a konfigurált csapatban, a tagok felvétele
 * (szükség esetén a csapatba is), a projektvezető csatorna-admin lesz.
 */
public class MattermostStepHandler implements StepHandler {

    private static final int DISPLAY_NAME_MAX = 64;
    private static final int PURPOSE_MAX = 250;

    private final MattermostClient client;
    private final KickoffProperties.Mattermost props;

    public MattermostStepHandler(MattermostClient client, KickoffProperties.Mattermost props) {
        this.client = client;
        this.props = props;
    }

    @Override
    public StepType type() {
        return StepType.MATTERMOST;
    }

    @Override
    public StepResult execute(ProvisioningContext ctx) {
        List<String> warnings = new ArrayList<>();
        String teamId = props.teamId();
        MattermostClient.Team team = client.getTeam(teamId);

        MattermostClient.Channel channel = client.findChannelByName(teamId, ctx.projectKey())
                .orElseGet(() -> client.createChannel(teamId, ctx.projectKey(),
                        truncate(ctx.name(), DISPLAY_NAME_MAX), truncate(ctx.description(), PURPOSE_MAX),
                        ctx.privateChannel()));

        for (Participant p : ctx.participants()) {
            try {
                Optional<MattermostClient.User> user = client.findUserByEmail(p.email());
                if (user.isEmpty()) {
                    warnings.add("Mattermost: nincs felhasználó ezzel az e-mail címmel: " + p.email());
                    continue;
                }
                String userId = user.get().id();
                client.addTeamMember(teamId, userId);
                client.addChannelMember(channel.id(), userId);
                if (p.role() == MemberRole.PROJECT_MANAGER) {
                    client.makeChannelAdmin(channel.id(), userId);
                }
            } catch (Exception e) {
                warnings.add("Mattermost: " + p.email() + " felvétele sikertelen (" + HttpErrors.describe(e) + ")");
            }
        }

        String url = client.baseUrl() + "/" + team.name() + "/channels/" + channel.name();
        return new StepResult(channel.id(), url, warnings);
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max);
    }
}
