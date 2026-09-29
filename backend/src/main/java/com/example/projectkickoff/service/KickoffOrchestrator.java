package com.example.projectkickoff.service;

import com.example.projectkickoff.domain.KickoffMember;
import com.example.projectkickoff.domain.KickoffStep;
import com.example.projectkickoff.domain.MemberRole;
import com.example.projectkickoff.domain.ProjectKickoff;
import com.example.projectkickoff.domain.StepStatus;
import com.example.projectkickoff.domain.StepType;
import com.example.projectkickoff.integration.HttpErrors;
import com.example.projectkickoff.integration.StepHandler;
import com.example.projectkickoff.integration.StepResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * A lépések háttérben, sorban futnak. Egy lépés hibája nem állítja meg a többit
 * (egymástól függetlenek), a hibás lépések később újrafuttathatók.
 */
@Component
public class KickoffOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(KickoffOrchestrator.class);

    private final KickoffStateStore store;
    private final Map<StepType, StepHandler> handlers;
    private final TaskExecutor executor;

    public KickoffOrchestrator(KickoffStateStore store, List<StepHandler> handlers,
                               @Qualifier("kickoffTaskExecutor") TaskExecutor executor) {
        this.store = store;
        this.handlers = handlers.stream().collect(Collectors.toMap(StepHandler::type, Function.identity()));
        this.executor = executor;
    }

    public boolean isEnabled(StepType type) {
        return handlers.containsKey(type);
    }

    public void start(Long kickoffId) {
        executor.execute(() -> {
            try {
                run(kickoffId);
            } catch (Exception e) {
                // Pl. optimista zárolási ütközés egy párhuzamos újrafuttatással.
                log.error("Projektindítás {} futtatása megszakadt", kickoffId, e);
            }
        });
    }

    void run(Long kickoffId) {
        ProjectKickoff snapshot = store.load(kickoffId);
        for (KickoffStep step : snapshot.getSteps()) {
            if (step.getStatus() != StepStatus.PENDING) {
                continue;
            }
            StepHandler handler = handlers.get(step.getType());
            if (handler == null) {
                store.finishStep(kickoffId, step.getId(), StepStatus.SKIPPED, null, null,
                        "Az integráció ki van kapcsolva a konfigurációban");
                continue;
            }
            if (!store.markStepRunning(kickoffId, step.getId())) {
                continue;
            }
            // Frissen töltjük be, hogy az előző lépések linkjei benne legyenek.
            ProvisioningContext ctx = buildContext(store.load(kickoffId));
            try {
                StepResult result = handler.execute(ctx);
                StepStatus status = result.warnings().isEmpty() ? StepStatus.SUCCESS : StepStatus.WARNING;
                store.finishStep(kickoffId, step.getId(), status, result.externalId(), result.url(),
                        result.warnings().isEmpty() ? null : String.join("\n", result.warnings()));
            } catch (Exception e) {
                log.warn("Projektindítás {} / {} sikertelen", snapshot.getProjectKey(), step.getType(), e);
                store.finishStep(kickoffId, step.getId(), StepStatus.FAILED, null, null, HttpErrors.describe(e));
            }
        }
    }

    static ProvisioningContext buildContext(ProjectKickoff kickoff) {
        List<ProvisioningContext.Participant> participants = new ArrayList<>();
        participants.add(new ProvisioningContext.Participant(kickoff.getProjectManagerEmail(),
                MemberRole.PROJECT_MANAGER));
        for (KickoffMember m : kickoff.getMembers()) {
            participants.add(new ProvisioningContext.Participant(m.getEmail(), m.getRole()));
        }
        Map<StepType, String> links = new EnumMap<>(StepType.class);
        for (KickoffStep s : kickoff.getSteps()) {
            if (s.getStatus().isDone() && s.getUrl() != null) {
                links.put(s.getType(), s.getUrl());
            }
        }
        return new ProvisioningContext(kickoff.getId(), kickoff.getProjectKey(), kickoff.getName(),
                kickoff.getDescription(), kickoff.getProjectManagerEmail(), kickoff.isPrivateChannel(),
                List.copyOf(participants), links);
    }
}
