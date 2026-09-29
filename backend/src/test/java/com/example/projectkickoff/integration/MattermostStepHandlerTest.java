package com.example.projectkickoff.integration;

import com.example.projectkickoff.config.KickoffProperties;
import com.example.projectkickoff.integration.mattermost.MattermostClient;
import com.example.projectkickoff.integration.mattermost.MattermostStepHandler;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class MattermostStepHandlerTest {

    private static final String API = "https://chat.example.com/api/v4";

    @Test
    void createsPrivateChannelAddsMembersAndMakesPmAdmin() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        KickoffProperties.Mattermost props = new KickoffProperties.Mattermost(true, "https://chat.example.com",
                "tok", "T1", true);
        MattermostStepHandler handler = new MattermostStepHandler(new MattermostClient(builder, props), props);

        server.expect(requestTo(API + "/teams/T1")).andExpect(header("Authorization", "Bearer tok"))
                .andRespond(withSuccess("{\"id\":\"T1\",\"name\":\"ceg\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(API + "/teams/T1/channels/name/ugyfelportal"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));
        server.expect(requestTo(API + "/channels")).andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.type").value("P"))
                .andExpect(jsonPath("$.name").value("ugyfelportal"))
                .andRespond(withSuccess("{\"id\":\"C1\",\"name\":\"ugyfelportal\"}", MediaType.APPLICATION_JSON));

        server.expect(requestTo(API + "/users/email/pm%40ceg.hu"))
                .andRespond(withSuccess("{\"id\":\"U1\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(API + "/teams/T1/members")).andRespond(withSuccess());
        server.expect(requestTo(API + "/channels/C1/members")).andExpect(content().json("{\"user_id\":\"U1\"}"))
                .andRespond(withSuccess());
        server.expect(requestTo(API + "/channels/C1/members/U1/schemeRoles")).andExpect(method(HttpMethod.PUT))
                .andRespond(withSuccess());

        server.expect(requestTo(API + "/users/email/dev%40ceg.hu"))
                .andRespond(withSuccess("{\"id\":\"U2\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(API + "/teams/T1/members")).andRespond(withSuccess());
        server.expect(requestTo(API + "/channels/C1/members")).andRespond(withSuccess());

        server.expect(requestTo(API + "/users/email/nincs%40ceg.hu")).andRespond(withStatus(HttpStatus.NOT_FOUND));

        StepResult result = handler.execute(GitLabStepHandlerTest.ctx());

        server.verify();
        assertThat(result.url()).isEqualTo("https://chat.example.com/ceg/channels/ugyfelportal");
        assertThat(result.warnings()).singleElement().asString().contains("nincs@ceg.hu");
    }
}
