package com.example.projectkickoff;

import com.example.projectkickoff.domain.StepType;
import com.example.projectkickoff.integration.StepHandler;
import com.example.projectkickoff.integration.StepResult;
import com.example.projectkickoff.people.PersonDirectory;
import com.example.projectkickoff.service.ProvisioningContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import java.util.List;
import java.util.Locale;

/**
 * Demó mód a felület kipróbálásához, valódi külső rendszerek nélkül:
 * <pre>mvn spring-boot:test-run -Dspring-boot.run.profiles=demo</pre>
 * Minden lépés ~1,5 mp-ig "fut"; a "nincs@..." kezdetű e-mail címekre figyelmeztetést ad,
 * a "hiba" szót tartalmazó projektnévre a Drive lépés elbukik (az újrafuttatás kipróbálásához).
 */
@Configuration
@Profile("demo")
class DemoIntegrations {

    private static final List<PersonDirectory.Person> PEOPLE = List.of(
            new PersonDirectory.Person("kovacs.anna@ceg.hu", "Kovács Anna"),
            new PersonDirectory.Person("nagy.peter@ceg.hu", "Nagy Péter"),
            new PersonDirectory.Person("szabo.eszter@ceg.hu", "Szabó Eszter"),
            new PersonDirectory.Person("toth.gabor@ceg.hu", "Tóth Gábor"));

    @Bean
    PersonDirectory demoPeople() {
        return (query, limit) -> PEOPLE.stream()
                .filter(p -> (p.email() + " " + p.displayName()).toLowerCase(Locale.ROOT)
                        .contains(query.toLowerCase(Locale.ROOT)))
                .limit(limit)
                .toList();
    }

    @Bean
    StepHandler demoGitlab() {
        return demo(StepType.GITLAB, ctx -> "https://gitlab.ceg.hu/projektek/" + ctx.projectKey());
    }

    @Bean
    StepHandler demoMattermost() {
        return demo(StepType.MATTERMOST, ctx -> "https://chat.ceg.hu/ceg/channels/" + ctx.projectKey());
    }

    @Bean
    StepHandler demoDrive() {
        return demo(StepType.DRIVE, ctx -> {
            if (ctx.name().toLowerCase(Locale.ROOT).contains("hiba") && retried.add(ctx.kickoffId())) {
                throw new IllegalStateException("HTTP 503: Drive API átmenetileg nem elérhető");
            }
            return "https://drive.google.com/drive/folders/demo-" + ctx.projectKey();
        });
    }

    @Bean
    StepHandler demoBookstack() {
        return demo(StepType.BOOKSTACK, ctx -> "https://wiki.ceg.hu/books/" + ctx.projectKey() + "/page/projekt-attekintes");
    }

    @Bean
    StepHandler demoSyncro() {
        return demo(StepType.SYNCRO, ctx -> "https://syncro.ceg.hu/projects/" + ctx.projectKey());
    }

    /** Az első próbálkozás elbukik, a második sikerül. */
    private final java.util.Set<Long> retried = java.util.concurrent.ConcurrentHashMap.newKeySet();

    private static StepHandler demo(StepType type, java.util.function.Function<ProvisioningContext, String> url) {
        return new StepHandler() {
            @Override
            public StepType type() {
                return type;
            }

            @Override
            public StepResult execute(ProvisioningContext ctx) throws Exception {
                Thread.sleep(1500);
                String link = url.apply(ctx);
                List<String> warnings = type == StepType.SYNCRO ? List.of() : ctx.participants().stream()
                        .filter(p -> p.email().startsWith("nincs"))
                        .map(p -> type.label() + ": nincs felhasználó ezzel az e-mail címmel: " + p.email())
                        .toList();
                return new StepResult("demo", link, warnings);
            }
        };
    }
}
