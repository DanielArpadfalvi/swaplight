package com.example.projectkickoff.integration;

import com.example.projectkickoff.config.KickoffProperties;
import com.example.projectkickoff.domain.MemberRole;
import com.example.projectkickoff.integration.gitlab.GitLabClient;
import com.example.projectkickoff.integration.gitlab.GitLabStepHandler;
import com.example.projectkickoff.service.ProvisioningContext;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

public class GitLabStepHandlerTest {

    private static final String API = "https://gitlab.example.com/api/v4";

    private final KickoffProperties.Gitlab props = new KickoffProperties.Gitlab(true, "https://gitlab.example.com/",
            "secret", 7L, true, "private", 50, 30, 20);

    public static ProvisioningContext ctx() {
        return new ProvisioningContext(1L, "ugyfelportal", "Ügyfélportál", "Leírás", "pm@ceg.hu", true,
                List.of(new ProvisioningContext.Participant("pm@ceg.hu", MemberRole.PROJECT_MANAGER),
                        new ProvisioningContext.Participant("dev@ceg.hu", MemberRole.MEMBER),
                        new ProvisioningContext.Participant("nincs@ceg.hu", MemberRole.VIEWER)),
                Map.of());
    }

    @Test
    void createsGroupAndProjectUnderParentAndAddsMembers() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        GitLabStepHandler handler = new GitLabStepHandler(new GitLabClient(builder, props), props);

        json(server, HttpMethod.GET, API + "/groups/7", "{\"id\":7,\"path\":\"projektek\",\"full_path\":\"ceg/projektek\"}");
        // A teljes útvonal egyetlen, %2F-fel kódolt path szegmens kell legyen.
        server.expect(requestTo(API + "/groups/ceg%2Fprojektek%2Fugyfelportal"))
                .andExpect(header("PRIVATE-TOKEN", "secret"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));
        server.expect(requestTo(API + "/groups")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.parent_id").value(7))
                .andExpect(jsonPath("$.path").value("ugyfelportal"))
                .andRespond(withSuccess("{\"id\":42,\"path\":\"ugyfelportal\",\"full_path\":\"ceg/projektek/ugyfelportal\","
                        + "\"web_url\":\"https://gitlab.example.com/groups/ceg/projektek/ugyfelportal\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(API + "/projects/ceg%2Fprojektek%2Fugyfelportal%2Fugyfelportal"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));
        server.expect(requestTo(API + "/projects")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.namespace_id").value(42))
                .andRespond(withSuccess("{\"id\":100,\"path\":\"ugyfelportal\"}", MediaType.APPLICATION_JSON));

        // PM: Owner (50)
        json(server, HttpMethod.GET, API + "/users?search=pm%40ceg.hu", "[{\"id\":1,\"email\":\"pm@ceg.hu\"}]");
        server.expect(requestTo(API + "/groups/42/members")).andExpect(method(HttpMethod.POST))
                .andExpect(content().json("{\"user_id\":1,\"access_level\":50}"))
                .andRespond(withSuccess());
        // Tag, aki már benne van -> 409 -> szint frissítése
        json(server, HttpMethod.GET, API + "/users?search=dev%40ceg.hu", "[{\"id\":2,\"email\":\"dev@ceg.hu\"}]");
        server.expect(requestTo(API + "/groups/42/members")).andRespond(withStatus(HttpStatus.CONFLICT));
        server.expect(requestTo(API + "/groups/42/members/2")).andExpect(method(HttpMethod.PUT))
                .andExpect(content().json("{\"access_level\":30}"))
                .andRespond(withSuccess());
        // Nem létező felhasználó -> figyelmeztetés
        json(server, HttpMethod.GET, API + "/users?search=nincs%40ceg.hu", "[]");

        StepResult result = handler.execute(ctx());

        server.verify();
        assertThat(result.externalId()).isEqualTo("42");
        assertThat(result.url()).isEqualTo("https://gitlab.example.com/groups/ceg/projektek/ugyfelportal");
        assertThat(result.warnings()).singleElement().asString().contains("nincs@ceg.hu");
    }

    @Test
    void reusesExistingGroupAndProject() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        KickoffProperties.Gitlab topLevel = new KickoffProperties.Gitlab(true, "https://gitlab.example.com", "secret",
                null, true, "private", 50, 30, 20);
        GitLabStepHandler handler = new GitLabStepHandler(new GitLabClient(builder, topLevel), topLevel);

        json(server, HttpMethod.GET, API + "/groups/ugyfelportal",
                "{\"id\":42,\"path\":\"ugyfelportal\",\"full_path\":\"ugyfelportal\",\"web_url\":\"u\"}");
        json(server, HttpMethod.GET, API + "/projects/ugyfelportal%2Fugyfelportal", "{\"id\":100,\"path\":\"ugyfelportal\"}");

        ProvisioningContext noMembers = new ProvisioningContext(1L, "ugyfelportal", "Ügyfélportál", null,
                "pm@ceg.hu", true, List.of(), Map.of());
        StepResult result = handler.execute(noMembers);

        server.verify();
        assertThat(result.externalId()).isEqualTo("42");
    }

    @Test
    void encodesPlusSignInEmailSearch() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        GitLabClient client = new GitLabClient(builder, props);
        json(server, HttpMethod.GET, API + "/users?search=a%2Bb%40ceg.hu", "[{\"id\":3,\"email\":\"a+b@ceg.hu\"}]");

        assertThat(client.findUserByEmail("a+b@ceg.hu")).hasValueSatisfying(u -> assertThat(u.id()).isEqualTo(3));
        server.verify();
    }

    private static void json(MockRestServiceServer server, HttpMethod method, String url, String body) {
        server.expect(requestTo(url)).andExpect(method(method)).andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
    }
}
