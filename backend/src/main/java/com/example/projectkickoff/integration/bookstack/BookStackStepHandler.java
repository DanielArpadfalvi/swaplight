package com.example.projectkickoff.integration.bookstack;

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
import java.util.stream.Collectors;

/**
 * BookStack könyv + nyitóoldal létrehozása a projektnek.
 *
 * <p>A BookStack jogosultságai szerepkör alapúak, ezért a tagok felvétele úgy történik, hogy
 * létrejön egy "Projekt: &lt;név&gt;" szerepkör, a tagok megkapják, és a szerepkör szerkesztési jogot kap a könyvre.
 */
public class BookStackStepHandler implements StepHandler {

    private final BookStackClient client;
    private final KickoffProperties.Bookstack props;

    public BookStackStepHandler(BookStackClient client, KickoffProperties.Bookstack props) {
        this.client = client;
        this.props = props;
    }

    @Override
    public StepType type() {
        return StepType.BOOKSTACK;
    }

    @Override
    public StepResult execute(ProvisioningContext ctx) {
        List<String> warnings = new ArrayList<>();

        BookStackClient.Book book = client.findBookByName(ctx.name())
                .orElseGet(() -> client.createBook(ctx.name(), ctx.description()));

        BookStackClient.Page page = client.findPage(book.id(), props.pageName())
                .orElseGet(() -> client.createPage(book.id(), props.pageName(), renderPage(ctx)));

        if (props.shelfId() != null) {
            BookStackClient.Shelf shelf = client.getShelf(props.shelfId());
            List<Long> ids = shelf.books() == null ? new ArrayList<>()
                    : shelf.books().stream().map(BookStackClient.Book::id).collect(Collectors.toCollection(ArrayList::new));
            if (!ids.contains(book.id())) {
                ids.add(book.id());
                client.setShelfBooks(shelf.id(), ids);
            }
        }

        if (props.createRole()) {
            String roleName = "Projekt: " + ctx.name();
            BookStackClient.Role role = client.findRoleByName(roleName)
                    .orElseGet(() -> client.createRole(roleName, "Automatikusan létrehozva a projektindításkor ("
                            + ctx.projectKey() + ")"));
            client.setBookPermissions(book.id(), role.id(), props.restrictToMembers());

            for (Participant p : ctx.participants()) {
                try {
                    Optional<BookStackClient.User> found = client.findUserByEmail(p.email());
                    if (found.isEmpty()) {
                        warnings.add("BookStack: nincs felhasználó ezzel az e-mail címmel: " + p.email());
                        continue;
                    }
                    BookStackClient.User user = client.getUser(found.get().id());
                    List<Long> roleIds = user.roles() == null ? new ArrayList<>()
                            : user.roles().stream().map(BookStackClient.Role::id)
                            .collect(Collectors.toCollection(ArrayList::new));
                    if (!roleIds.contains(role.id())) {
                        roleIds.add(role.id());
                        client.setUserRoles(user.id(), roleIds);
                    }
                } catch (Exception e) {
                    warnings.add("BookStack: " + p.email() + " felvétele sikertelen (" + HttpErrors.describe(e) + ")");
                }
            }
        }

        String bookSlug = page.bookSlug() != null ? page.bookSlug() : book.slug();
        String url = client.baseUrl() + "/books/" + bookSlug + "/page/" + page.slug();
        return new StepResult(String.valueOf(book.id()), url, warnings);
    }

    private static String links(ProvisioningContext ctx) {
        if (ctx.links().isEmpty()) {
            return "";
        }
        return ctx.links().entrySet().stream()
                .map(e -> "- [" + e.getKey().label() + "](" + e.getValue() + ")")
                .collect(Collectors.joining("\n"));
    }

    String renderPage(ProvisioningContext ctx) {
        String members = ctx.participants().stream()
                .map(p -> "- " + p.email() + (p.role() == MemberRole.PROJECT_MANAGER ? " (projektvezető)"
                        : p.role() == MemberRole.VIEWER ? " (megtekintő)" : ""))
                .collect(Collectors.joining("\n"));
        return props.pageTemplate()
                .replace("{name}", ctx.name())
                .replace("{key}", ctx.projectKey())
                .replace("{description}", ctx.description() == null ? "" : ctx.description())
                .replace("{pm}", ctx.projectManagerEmail())
                .replace("{members}", members)
                .replace("{links}", links(ctx));
    }
}
