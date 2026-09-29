package com.example.projectkickoff.integration.bookstack;

import com.example.projectkickoff.config.KickoffProperties;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Vékony kliens a BookStack REST API-hoz (a roles és content-permissions végpontok miatt v23.05+ kell).
 */
public class BookStackClient {

    private final RestClient http;
    private final String baseUrl;

    public BookStackClient(RestClient.Builder builder, KickoffProperties.Bookstack props) {
        this.baseUrl = props.baseUrl() != null && props.baseUrl().endsWith("/")
                ? props.baseUrl().substring(0, props.baseUrl().length() - 1)
                : props.baseUrl();
        this.http = builder
                .baseUrl(baseUrl + "/api")
                .defaultHeader("Authorization", "Token " + props.tokenId() + ":" + props.tokenSecret())
                .build();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Book(long id, String name, String slug) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Page(long id, String name, String slug, @JsonProperty("book_id") long bookId,
                       @JsonProperty("book_slug") String bookSlug) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Role(long id, @JsonProperty("display_name") String displayName) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record User(long id, String email, List<Role> roles) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Shelf(long id, List<Book> books) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Listing<T>(List<T> data) {
    }

    public String baseUrl() {
        return baseUrl;
    }

    public Optional<Book> findBookByName(String name) {
        return first(list("/books", Map.of("name", name), new ParameterizedTypeReference<Listing<Book>>() {
        }));
    }

    public Book createBook(String name, String description) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        if (description != null) {
            body.put("description", description);
        }
        return http.post().uri("/books").body(body).retrieve().body(Book.class);
    }

    public Optional<Page> findPage(long bookId, String name) {
        return first(list("/pages", Map.of("book_id", String.valueOf(bookId), "name", name),
                new ParameterizedTypeReference<Listing<Page>>() {
                }));
    }

    public Page createPage(long bookId, String name, String markdown) {
        return http.post().uri("/pages")
                .body(Map.of("book_id", bookId, "name", name, "markdown", markdown))
                .retrieve().body(Page.class);
    }

    public Shelf getShelf(long id) {
        return http.get().uri("/shelves/{id}", id).retrieve().body(Shelf.class);
    }

    /** A polc könyvlistáját teljesen lecseréli. */
    public void setShelfBooks(long shelfId, List<Long> bookIds) {
        http.put().uri("/shelves/{id}", shelfId).body(Map.of("books", bookIds)).retrieve().toBodilessEntity();
    }

    public Optional<Role> findRoleByName(String displayName) {
        return first(list("/roles", Map.of("display_name", displayName),
                new ParameterizedTypeReference<Listing<Role>>() {
                }));
    }

    public Role createRole(String displayName, String description) {
        return http.post().uri("/roles")
                .body(Map.of("display_name", displayName, "description", description, "permissions", List.of()))
                .retrieve().body(Role.class);
    }

    public Optional<User> findUserByEmail(String email) {
        return first(list("/users", Map.of("email", email),
                new ParameterizedTypeReference<Listing<User>>() {
                }));
    }

    public User getUser(long id) {
        return http.get().uri("/users/{id}", id).retrieve().body(User.class);
    }

    /** A felhasználó szerepköreit teljesen lecseréli. */
    public void setUserRoles(long userId, List<Long> roleIds) {
        http.put().uri("/users/{id}", userId).body(Map.of("roles", roleIds)).retrieve().toBodilessEntity();
    }

    /**
     * Könyv szintű jogosultság a szerepkörnek.
     *
     * @param restrictOthers true: mindenki más (az adminokon kívül) elveszti a hozzáférést
     */
    public void setBookPermissions(long bookId, long roleId, boolean restrictOthers) {
        Map<String, Object> fallback = restrictOthers
                ? Map.of("inheriting", false, "view", false, "create", false, "update", false, "delete", false)
                : Map.of("inheriting", true);
        http.put().uri("/content-permissions/book/{id}", bookId)
                .body(Map.of(
                        "role_permissions", List.of(Map.of(
                                "role_id", roleId, "view", true, "create", true, "update", true, "delete", false)),
                        "fallback_permissions", fallback))
                .retrieve().toBodilessEntity();
    }

    private <T> List<T> list(String path, Map<String, String> filters,
                             ParameterizedTypeReference<Listing<T>> type) {
        Listing<T> listing = http.get()
                .uri(b -> {
                    b.path(path);
                    Map<String, String> vars = new HashMap<>();
                    filters.forEach((k, v) -> {
                        b.queryParam("filter[" + k + "]", "{" + k + "}");
                        vars.put(k, v);
                    });
                    return b.build(vars);
                })
                .retrieve()
                .body(type);
        return listing == null || listing.data() == null ? List.of() : listing.data();
    }

    private static <T> Optional<T> first(List<T> items) {
        return items.stream().findFirst();
    }
}
