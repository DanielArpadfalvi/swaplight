package com.example.projectkickoff.service;

import com.example.projectkickoff.api.KickoffDtos.CreateKickoffRequest;
import com.example.projectkickoff.api.KickoffDtos.MemberRequest;
import com.example.projectkickoff.domain.KickoffMember;
import com.example.projectkickoff.domain.KickoffStatus;
import com.example.projectkickoff.domain.KickoffStep;
import com.example.projectkickoff.domain.MemberRole;
import com.example.projectkickoff.domain.ProjectKickoff;
import com.example.projectkickoff.domain.ProjectKickoffRepository;
import com.example.projectkickoff.domain.StepType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class ProjectKickoffService {

    private static final Logger log = LoggerFactory.getLogger(ProjectKickoffService.class);

    private final ProjectKickoffRepository repository;
    private final KickoffStateStore store;
    private final KickoffOrchestrator orchestrator;

    public ProjectKickoffService(ProjectKickoffRepository repository, KickoffStateStore store,
                                 KickoffOrchestrator orchestrator) {
        this.repository = repository;
        this.store = store;
        this.orchestrator = orchestrator;
    }

    public List<StepType> enabledIntegrations() {
        return Arrays.stream(StepType.values()).filter(orchestrator::isEnabled).toList();
    }

    public boolean isKeyAvailable(String projectKey) {
        return !repository.existsByProjectKeyIgnoreCase(projectKey);
    }

    /**
     * Elmenti a kérést és a háttérben elindítja a lépéseket.
     * Szándékosan nem tranzakciós: a háttérszál csak a commit után indulhat.
     */
    public ProjectKickoff create(CreateKickoffRequest request, String createdBy) {
        String key = request.projectKey().toLowerCase(Locale.ROOT);
        if (!isKeyAvailable(key)) {
            throw new KickoffConflictException("Ez a projektkulcs már foglalt: " + key);
        }

        List<StepType> steps = selectSteps(request.integrations());
        if (steps.isEmpty()) {
            throw new IllegalArgumentException("Nincs egyetlen bekapcsolt integráció sem");
        }

        String pmEmail = normalizeEmail(request.projectManagerEmail());
        ProjectKickoff kickoff = new ProjectKickoff(key, request.name().trim(), blankToNull(request.description()),
                pmEmail, request.privateChannel(), createdBy);
        dedupeMembers(request.members(), pmEmail).forEach((email, role) -> kickoff.addMember(new KickoffMember(email, role)));
        steps.forEach(type -> kickoff.addStep(new KickoffStep(type)));

        ProjectKickoff saved;
        try {
            saved = repository.save(kickoff);
        } catch (DataIntegrityViolationException e) {
            throw new KickoffConflictException("Ez a projektkulcs már foglalt: " + key);
        }
        orchestrator.start(saved.getId());
        return saved;
    }

    public ProjectKickoff get(Long id) {
        return store.load(id);
    }

    public List<ProjectKickoff> latest() {
        return repository.findTop50ByOrderByCreatedAtDesc();
    }

    /**
     * A hibás és figyelmeztetéses lépések újrafuttatása (pl. ha egy tag azóta regisztrált a GitLabba).
     * A sikeres lépések nem futnak le újra.
     */
    public ProjectKickoff retry(Long id) {
        ProjectKickoff current = store.load(id);
        ensureNotRunning(current);
        if (current.getStatus() != KickoffStatus.FAILED && current.getStatus() != KickoffStatus.COMPLETED_WITH_WARNINGS) {
            throw new KickoffConflictException("Nincs újrafuttatható lépés");
        }
        ProjectKickoff reset = store.resetRetryableSteps(id);
        orchestrator.start(id);
        return reset;
    }

    /** Tagok utólagos hozzáadása egy már elindított projekthez; mindenhova felveszi őket. */
    public ProjectKickoff addMembers(Long id, List<MemberRequest> members) {
        ProjectKickoff current = store.load(id);
        ensureNotRunning(current);
        Map<String, MemberRole> newMembers = dedupeMembers(members, current.getProjectManagerEmail());
        if (newMembers.isEmpty()) {
            throw new IllegalArgumentException("Nincs új tag megadva");
        }
        ProjectKickoff updated = store.addMembers(id, newMembers);
        orchestrator.start(id);
        return updated;
    }

    private static void ensureNotRunning(ProjectKickoff k) {
        if (k.getStatus() == KickoffStatus.RUNNING || k.getStatus() == KickoffStatus.PENDING) {
            throw new KickoffConflictException("A projektindítás még fut");
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recoverAfterRestart() {
        for (ProjectKickoff k : repository.findByStatusIn(List.of(KickoffStatus.RUNNING, KickoffStatus.PENDING))) {
            if (k.getStatus() == KickoffStatus.RUNNING) {
                log.info("Félbemaradt projektindítás: {}", k.getProjectKey());
                store.failInterruptedSteps(k.getId());
            } else {
                log.info("El nem indult projektindítás folytatása: {}", k.getProjectKey());
                orchestrator.start(k.getId());
            }
        }
    }

    private List<StepType> selectSteps(Set<StepType> requested) {
        List<StepType> enabled = enabledIntegrations();
        if (requested == null || requested.isEmpty()) {
            return enabled;
        }
        List<StepType> disabled = requested.stream().filter(t -> !enabled.contains(t)).toList();
        if (!disabled.isEmpty()) {
            throw new IllegalArgumentException("Nincs bekapcsolva: " + disabled);
        }
        // Mindig a StepType sorrendjében futnak (Syncro utoljára).
        return enabled.stream().filter(requested::contains).toList();
    }

    /** Kis-nagybetű független duplikátumszűrés; a projektvezető nem szerepelhet tagként is. */
    static Map<String, MemberRole> dedupeMembers(List<MemberRequest> members, String pmEmail) {
        Map<String, MemberRole> result = new LinkedHashMap<>();
        if (members == null) {
            return result;
        }
        for (MemberRequest m : members) {
            if (m.role() == MemberRole.PROJECT_MANAGER) {
                throw new IllegalArgumentException("A projektvezetőt a projectManagerEmail mezőben kell megadni");
            }
            String email = normalizeEmail(m.email());
            if (email.equals(pmEmail)) {
                continue;
            }
            // Ha valaki kétszer szerepel, az erősebb szerepkör marad.
            result.merge(email, m.role(), (a, b) -> a == MemberRole.MEMBER || b == MemberRole.MEMBER
                    ? MemberRole.MEMBER : MemberRole.VIEWER);
        }
        return result;
    }

    private static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
