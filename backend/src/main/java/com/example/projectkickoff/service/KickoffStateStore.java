package com.example.projectkickoff.service;

import com.example.projectkickoff.domain.KickoffMember;
import com.example.projectkickoff.domain.KickoffStep;
import com.example.projectkickoff.domain.MemberRole;
import com.example.projectkickoff.domain.ProjectKickoff;
import com.example.projectkickoff.domain.ProjectKickoffRepository;
import com.example.projectkickoff.domain.StepStatus;
import com.example.projectkickoff.domain.StepType;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.function.Consumer;

/**
 * Az állapotváltozások rövid, külön tranzakciókban mennek, hogy a felület
 * (polling) lépésről lépésre lássa a haladást, és egy hosszú külső hívás ne tartson nyitva tranzakciót.
 */
@Component
public class KickoffStateStore {

    private final ProjectKickoffRepository repository;

    public KickoffStateStore(ProjectKickoffRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public ProjectKickoff load(Long kickoffId) {
        return repository.findById(kickoffId)
                .orElseThrow(() -> new KickoffNotFoundException(kickoffId));
    }

    /**
     * @return false, ha a lépés közben már nem PENDING (pl. egy párhuzamos futás elvitte)
     */
    @Transactional
    public boolean markStepRunning(Long kickoffId, Long stepId) {
        ProjectKickoff kickoff = load(kickoffId);
        KickoffStep step = kickoff.findStep(stepId)
                .orElseThrow(() -> new IllegalStateException("Nincs ilyen lépés: " + stepId));
        if (step.getStatus() != StepStatus.PENDING) {
            return false;
        }
        step.markRunning();
        kickoff.recomputeStatus();
        repository.save(kickoff);
        return true;
    }

    /** Alkalmazás-újraindítás után a félbemaradt (RUNNING) lépéseket hibásnak jelöli, hogy újrafuttathatók legyenek. */
    @Transactional
    public void failInterruptedSteps(Long kickoffId) {
        ProjectKickoff kickoff = load(kickoffId);
        kickoff.getSteps().stream()
                .filter(s -> s.getStatus() == StepStatus.RUNNING)
                .forEach(s -> s.markFinished(StepStatus.FAILED, null, null,
                        "Megszakadt (az alkalmazás újraindult futás közben). Újrafuttatható."));
        kickoff.recomputeStatus();
        repository.save(kickoff);
    }

    @Transactional
    public void finishStep(Long kickoffId, Long stepId, StepStatus status, String externalId, String url,
                           String message) {
        updateStep(kickoffId, stepId, s -> s.markFinished(status, externalId, url, message));
    }

    /**
     * Újrafuttatás előtt a hibás és figyelmeztetéses lépéseket visszaállítja PENDING-re.
     * A Syncro lépés ilyenkor mindig újrafut, hogy az újonnan létrejött linkeket is megkapja.
     */
    @Transactional
    public ProjectKickoff resetRetryableSteps(Long kickoffId) {
        ProjectKickoff kickoff = load(kickoffId);
        kickoff.getSteps().stream()
                .filter(s -> s.getStatus() == StepStatus.FAILED || s.getStatus() == StepStatus.WARNING
                        || (s.getType() == StepType.SYNCRO && s.getStatus() != StepStatus.SKIPPED))
                .forEach(KickoffStep::resetToPending);
        kickoff.recomputeStatus();
        return repository.save(kickoff);
    }

    /** Új tagok felvétele; minden (nem kihagyott) lépés újrafut, hogy a tagok mindenhova bekerüljenek. */
    @Transactional
    public ProjectKickoff addMembers(Long kickoffId, Map<String, MemberRole> newMembers) {
        ProjectKickoff kickoff = load(kickoffId);
        newMembers.forEach((email, role) -> {
            if (!kickoff.hasMember(email)) {
                kickoff.addMember(new KickoffMember(email, role));
            }
        });
        kickoff.getSteps().stream()
                .filter(s -> s.getStatus() != StepStatus.SKIPPED)
                .forEach(KickoffStep::resetToPending);
        kickoff.recomputeStatus();
        return repository.save(kickoff);
    }

    private void updateStep(Long kickoffId, Long stepId, Consumer<KickoffStep> change) {
        ProjectKickoff kickoff = load(kickoffId);
        KickoffStep step = kickoff.findStep(stepId)
                .orElseThrow(() -> new IllegalStateException("Nincs ilyen lépés: " + stepId));
        change.accept(step);
        kickoff.recomputeStatus();
        repository.save(kickoff);
    }
}
