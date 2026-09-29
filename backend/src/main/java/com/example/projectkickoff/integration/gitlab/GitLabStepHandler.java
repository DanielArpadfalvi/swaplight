package com.example.projectkickoff.integration.gitlab;

import com.example.projectkickoff.config.KickoffProperties;
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
 * GitLab csoport (+ opcionálisan egy azonos nevű projekt) létrehozása és a tagok felvétele
 * csoport szinten (a projekt ezt örökli).
 */
public class GitLabStepHandler implements StepHandler {

    private final GitLabClient client;
    private final KickoffProperties.Gitlab props;

    public GitLabStepHandler(GitLabClient client, KickoffProperties.Gitlab props) {
        this.client = client;
        this.props = props;
    }

    @Override
    public StepType type() {
        return StepType.GITLAB;
    }

    @Override
    public StepResult execute(ProvisioningContext ctx) {
        List<String> warnings = new ArrayList<>();

        String groupFullPath = ctx.projectKey();
        if (props.parentGroupId() != null) {
            groupFullPath = client.getGroup(props.parentGroupId()).fullPath() + "/" + ctx.projectKey();
        }
        GitLabClient.Group group = client.findGroupByFullPath(groupFullPath)
                .orElseGet(() -> client.createGroup(ctx.name(), ctx.projectKey(), props.parentGroupId(),
                        props.visibility(), ctx.description()));

        if (props.createProject()) {
            String projectFullPath = group.fullPath() + "/" + ctx.projectKey();
            if (client.findProjectByFullPath(projectFullPath).isEmpty()) {
                client.createProject(ctx.name(), ctx.projectKey(), group.id(), props.visibility(), ctx.description());
            }
        }

        for (Participant p : ctx.participants()) {
            try {
                Optional<GitLabClient.User> user = client.findUserByEmail(p.email());
                if (user.isEmpty()) {
                    warnings.add("GitLab: nincs felhasználó ezzel az e-mail címmel: " + p.email());
                    continue;
                }
                client.addOrUpdateGroupMember(group.id(), user.get().id(), accessLevel(p));
            } catch (Exception e) {
                warnings.add("GitLab: " + p.email() + " felvétele sikertelen (" + HttpErrors.describe(e) + ")");
            }
        }

        return new StepResult(String.valueOf(group.id()), group.webUrl(), warnings);
    }

    private int accessLevel(Participant p) {
        return switch (p.role()) {
            case PROJECT_MANAGER -> props.projectManagerAccessLevel();
            case MEMBER -> props.memberAccessLevel();
            case VIEWER -> props.viewerAccessLevel();
        };
    }
}
