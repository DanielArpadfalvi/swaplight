package com.example.projectkickoff.api;

import com.example.projectkickoff.api.KickoffDtos.AddMembersRequest;
import com.example.projectkickoff.api.KickoffDtos.CreateKickoffRequest;
import com.example.projectkickoff.api.KickoffDtos.IntegrationOption;
import com.example.projectkickoff.api.KickoffDtos.KeyAvailability;
import com.example.projectkickoff.api.KickoffDtos.KickoffOptions;
import com.example.projectkickoff.api.KickoffDtos.KickoffSummary;
import com.example.projectkickoff.api.KickoffDtos.KickoffView;
import com.example.projectkickoff.people.PersonDirectory;
import com.example.projectkickoff.service.ProjectKickoffService;
import com.example.projectkickoff.service.Slugs;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.List;

/**
 * Projektindítás REST API.
 *
 * <p>Jogosultság: integráláskor érdemes a meglévő security konfigurációban a {@code /api/project-kickoffs/**}
 * útvonalat a projektvezetői szerepkörhöz kötni (vagy ide {@code @PreAuthorize}-t tenni).
 */
@RestController
@RequestMapping("/api/project-kickoffs")
public class ProjectKickoffController {

    private final ProjectKickoffService service;
    private final PersonDirectory personDirectory;

    public ProjectKickoffController(ProjectKickoffService service, PersonDirectory personDirectory) {
        this.service = service;
        this.personDirectory = personDirectory;
    }

    /** Az űrlaphoz: mely integrációk vannak bekapcsolva. */
    @GetMapping("/options")
    public KickoffOptions options() {
        return new KickoffOptions(
                service.enabledIntegrations().stream().map(t -> new IntegrationOption(t, t.label())).toList(),
                Slugs.KEY_REGEX);
    }

    /** Személykereső a projektvezető / tagok mezőhöz. */
    @GetMapping("/people")
    public List<PersonDirectory.Person> people(@RequestParam("q") String query) {
        if (query == null || query.trim().length() < 2) {
            return List.of();
        }
        return personDirectory.search(query.trim(), 20);
    }

    @GetMapping("/key-availability")
    public KeyAvailability keyAvailability(@RequestParam("key") String key) {
        String normalized = key.toLowerCase();
        return new KeyAvailability(normalized, normalized.matches(Slugs.KEY_REGEX) && service.isKeyAvailable(normalized));
    }

    @GetMapping
    public List<KickoffSummary> list() {
        return service.latest().stream().map(KickoffSummary::of).toList();
    }

    @GetMapping("/{id}")
    public KickoffView get(@PathVariable("id") Long id) {
        return KickoffView.of(service.get(id));
    }

    /** Elindítja a projektindítást; a lépések a háttérben futnak, az állapot a GET /{id}-n követhető. */
    @PostMapping
    public ResponseEntity<KickoffView> create(@Valid @RequestBody CreateKickoffRequest request, Principal principal) {
        String createdBy = principal != null ? principal.getName() : null;
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(KickoffView.of(service.create(request, createdBy)));
    }

    /** A hibás / figyelmeztetéses lépések újrafuttatása. */
    @PostMapping("/{id}/retry")
    public ResponseEntity<KickoffView> retry(@PathVariable("id") Long id) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(KickoffView.of(service.retry(id)));
    }

    /** Új tagok felvétele utólag, minden rendszerbe. */
    @PostMapping("/{id}/members")
    public ResponseEntity<KickoffView> addMembers(@PathVariable("id") Long id,
                                                  @Valid @RequestBody AddMembersRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(KickoffView.of(service.addMembers(id, request.members())));
    }
}
