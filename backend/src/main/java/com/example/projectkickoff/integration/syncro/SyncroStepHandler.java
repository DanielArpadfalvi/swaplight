package com.example.projectkickoff.integration.syncro;

import com.example.projectkickoff.domain.StepType;
import com.example.projectkickoff.integration.IntegrationException;
import com.example.projectkickoff.integration.StepHandler;
import com.example.projectkickoff.integration.StepResult;
import com.example.projectkickoff.service.ProvisioningContext;

import java.util.List;

/** A projekt felvétele a Syncro-ba, az összes korábban létrehozott erőforrás linkjével. */
public class SyncroStepHandler implements StepHandler {

    private final SyncroGateway gateway;

    public SyncroStepHandler(SyncroGateway gateway) {
        this.gateway = gateway;
    }

    @Override
    public StepType type() {
        return StepType.SYNCRO;
    }

    @Override
    public StepResult execute(ProvisioningContext ctx) {
        SyncroGateway.SyncroProjectRef ref = gateway.upsertProject(new SyncroGateway.SyncroProjectCommand(
                ctx.projectKey(),
                ctx.name(),
                ctx.description(),
                ctx.projectManagerEmail(),
                ctx.participants().stream().map(p -> new SyncroGateway.Member(p.email(), p.role())).toList(),
                ctx.links()));
        if (ref == null) {
            throw new IntegrationException("A Syncro nem adott vissza projekt azonosítót");
        }
        return new StepResult(ref.id(), ref.url(), List.of());
    }
}
