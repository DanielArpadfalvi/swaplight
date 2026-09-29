package com.example.projectkickoff.integration;

import com.example.projectkickoff.config.KickoffProperties;
import com.example.projectkickoff.domain.MemberRole;
import com.example.projectkickoff.domain.StepType;
import com.example.projectkickoff.integration.bookstack.BookStackClient;
import com.example.projectkickoff.integration.bookstack.BookStackStepHandler;
import com.example.projectkickoff.service.ProvisioningContext;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class BookStackStepHandlerTest {

    private static final String API = "https://wiki.example.com/api";

    @Test
    void createsBookPageRoleAndAssignsMembers() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        KickoffProperties.Bookstack props = new KickoffProperties.Bookstack(true, "https://wiki.example.com",
                "id", "sec", 3L, "Projekt áttekintés", "# {name}\n{pm}\n{members}\n{links}", true, false);
        BookStackStepHandler handler = new BookStackStepHandler(new BookStackClient(builder, props), props);

        ProvisioningContext ctx = new ProvisioningContext(1L, "ugyfelportal", "Ügyfélportál", null, "pm@ceg.hu",
                true, List.of(new ProvisioningContext.Participant("pm@ceg.hu", MemberRole.PROJECT_MANAGER),
                new ProvisioningContext.Participant("dev@ceg.hu", MemberRole.MEMBER)),
                Map.of(StepType.GITLAB, "https://gitlab/g"));

        server.expect(r -> {
                    assertThat(r.getURI().getPath()).isEqualTo("/api/books");
                    assertThat(URLDecoder.decode(r.getURI().getRawQuery(), StandardCharsets.UTF_8))
                            .isEqualTo("filter[name]=Ügyfélportál");
                })
                .andExpect(header("Authorization", "Token id:sec"))
                .andRespond(withSuccess("{\"data\":[]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(API + "/books")).andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("{\"id\":5,\"name\":\"Ügyfélportál\",\"slug\":\"ugyfelportal\"}", MediaType.APPLICATION_JSON));
        server.expect(r -> assertThat(r.getURI().getPath()).isEqualTo("/api/pages"))
                .andRespond(withSuccess("{\"data\":[]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(API + "/pages")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.book_id").value(5))
                .andExpect(jsonPath("$.markdown").value(
                        "# Ügyfélportál\npm@ceg.hu\n- pm@ceg.hu (projektvezető)\n- dev@ceg.hu\n- [GitLab csoport és projekt](https://gitlab/g)"))
                .andRespond(withSuccess("{\"id\":9,\"slug\":\"projekt-attekintes\",\"book_id\":5}", MediaType.APPLICATION_JSON));
        // polc: meglévő könyvek megtartása
        server.expect(requestTo(API + "/shelves/3"))
                .andRespond(withSuccess("{\"id\":3,\"books\":[{\"id\":1}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(API + "/shelves/3")).andExpect(method(HttpMethod.PUT))
                .andExpect(content().json("{\"books\":[1,5]}"))
                .andRespond(withSuccess());
        // szerepkör
        server.expect(r -> assertThat(r.getURI().getPath()).isEqualTo("/api/roles"))
                .andRespond(withSuccess("{\"data\":[]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(API + "/roles")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.display_name").value("Projekt: Ügyfélportál"))
                .andRespond(withSuccess("{\"id\":11}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(API + "/content-permissions/book/5")).andExpect(method(HttpMethod.PUT))
                .andExpect(jsonPath("$.role_permissions[0].role_id").value(11))
                .andExpect(jsonPath("$.fallback_permissions.inheriting").value(true))
                .andRespond(withSuccess());
        // PM: már megvan a szerepköre -> nincs PUT
        server.expect(r -> assertThat(r.getURI().getPath()).isEqualTo("/api/users"))
                .andRespond(withSuccess("{\"data\":[{\"id\":21}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(API + "/users/21"))
                .andRespond(withSuccess("{\"id\":21,\"roles\":[{\"id\":11}]}", MediaType.APPLICATION_JSON));
        // Tag: meglévő szerepkör megtartása + új
        server.expect(r -> assertThat(r.getURI().getPath()).isEqualTo("/api/users"))
                .andRespond(withSuccess("{\"data\":[{\"id\":22}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(API + "/users/22"))
                .andRespond(withSuccess("{\"id\":22,\"roles\":[{\"id\":2}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(API + "/users/22")).andExpect(method(HttpMethod.PUT))
                .andExpect(content().json("{\"roles\":[2,11]}"))
                .andRespond(withSuccess());

        StepResult result = handler.execute(ctx);

        server.verify();
        assertThat(result.url()).isEqualTo("https://wiki.example.com/books/ugyfelportal/page/projekt-attekintes");
        assertThat(result.warnings()).isEmpty();
    }
}
