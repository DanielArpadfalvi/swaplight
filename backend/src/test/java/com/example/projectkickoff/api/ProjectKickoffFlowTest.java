package com.example.projectkickoff.api;

import com.example.projectkickoff.domain.StepType;
import com.example.projectkickoff.integration.StepHandler;
import com.example.projectkickoff.integration.StepResult;
import com.example.projectkickoff.service.ProvisioningContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ProjectKickoffFlowTest {

    static final AtomicBoolean gitlabFails = new AtomicBoolean();
    static final List<ProvisioningContext> syncroCalls = new CopyOnWriteArrayList<>();

    @TestConfiguration
    static class FakeIntegrations {

        @Bean
        StepHandler fakeGitlab() {
            return new StepHandler() {
                public StepType type() {
                    return StepType.GITLAB;
                }

                public StepResult execute(ProvisioningContext ctx) {
                    if (gitlabFails.get()) {
                        throw new IllegalStateException("GitLab nem elérhető");
                    }
                    List<String> warnings = ctx.participants().stream()
                            .filter(p -> p.email().startsWith("ismeretlen"))
                            .map(p -> "nincs ilyen felhasználó: " + p.email()).toList();
                    return new StepResult("42", "https://gitlab/" + ctx.projectKey(), warnings);
                }
            };
        }

        @Bean
        StepHandler fakeSyncro() {
            return new StepHandler() {
                public StepType type() {
                    return StepType.SYNCRO;
                }

                public StepResult execute(ProvisioningContext ctx) {
                    syncroCalls.add(ctx);
                    return new StepResult("S1", "https://syncro/projects/" + ctx.projectKey(), List.of());
                }
            };
        }
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    ObjectMapper json;

    @BeforeEach
    void reset() {
        gitlabFails.set(false);
        syncroCalls.clear();
    }

    @Test
    void optionsListOnlyEnabledIntegrationsInOrder() throws Exception {
        mvc.perform(get("/api/project-kickoffs/options"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.integrations[0].type").value("GITLAB"))
                .andExpect(jsonPath("$.integrations[1].type").value("SYNCRO"))
                .andExpect(jsonPath("$.integrations.length()").value(2));
    }

    @Test
    void fullRunPassesLinksToSyncroAndDedupesMembers() throws Exception {
        long id = create("""
                {"name":"Ügyfélportál","projectKey":"ugyfelportal","description":"Új portál",
                 "projectManagerEmail":"PM@ceg.hu","privateChannel":true,
                 "members":[{"email":"dev@ceg.hu","role":"MEMBER"},
                            {"email":"DEV@ceg.hu","role":"VIEWER"},
                            {"email":"pm@ceg.hu","role":"MEMBER"},
                            {"email":"qa@ceg.hu","role":"VIEWER"}]}
                """);

        JsonNode done = awaitFinished(id);
        assertThat(done.get("status").asText()).isEqualTo("COMPLETED");
        assertThat(done.get("members")).hasSize(2);
        assertThat(done.get("members").get(0).get("role").asText()).isEqualTo("MEMBER");
        assertThat(done.get("steps").get(0).get("url").asText()).isEqualTo("https://gitlab/ugyfelportal");

        ProvisioningContext syncro = syncroCalls.get(0);
        assertThat(syncro.projectManagerEmail()).isEqualTo("pm@ceg.hu");
        assertThat(syncro.links()).containsEntry(StepType.GITLAB, "https://gitlab/ugyfelportal");
        assertThat(syncro.participants()).hasSize(3);

        // a kulcs foglalt lett
        mvc.perform(get("/api/project-kickoffs/key-availability").param("key", "ugyfelportal"))
                .andExpect(jsonPath("$.available").value(false));
        mvc.perform(post("/api/project-kickoffs").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X\",\"projectKey\":\"ugyfelportal\",\"projectManagerEmail\":\"pm@ceg.hu\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void failedStepCanBeRetriedAndOtherStepsStillRun() throws Exception {
        gitlabFails.set(true);
        long id = create("{\"name\":\"Belső CRM\",\"projectKey\":\"belso-crm\",\"projectManagerEmail\":\"pm@ceg.hu\"}");

        JsonNode failed = awaitFinished(id);
        assertThat(failed.get("status").asText()).isEqualTo("FAILED");
        assertThat(failed.get("steps").get(0).get("status").asText()).isEqualTo("FAILED");
        assertThat(failed.get("steps").get(0).get("message").asText()).contains("GitLab nem elérhető");
        assertThat(failed.get("steps").get(1).get("status").asText()).isEqualTo("SUCCESS");

        gitlabFails.set(false);
        mvc.perform(post("/api/project-kickoffs/{id}/retry", id)).andExpect(status().isAccepted());

        JsonNode retried = awaitFinished(id);
        assertThat(retried.get("status").asText()).isEqualTo("COMPLETED");
        assertThat(retried.get("steps").get(0).get("attempts").asInt()).isEqualTo(2);
        // a Syncro újrafut, és most már megkapja a GitLab linket is
        assertThat(retried.get("steps").get(1).get("attempts").asInt()).isEqualTo(2);
        assertThat(syncroCalls.get(0).links()).doesNotContainKey(StepType.GITLAB);
        assertThat(syncroCalls.get(1).links()).containsEntry(StepType.GITLAB, "https://gitlab/belso-crm");
    }

    @Test
    void addingMembersLaterRerunsAllSteps() throws Exception {
        long id = create("{\"name\":\"Mobil app\",\"projectKey\":\"mobil-app\",\"projectManagerEmail\":\"pm@ceg.hu\"}");
        awaitFinished(id);

        mvc.perform(post("/api/project-kickoffs/{id}/members", id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"members\":[{\"email\":\"ismeretlen@ceg.hu\",\"role\":\"MEMBER\"}]}"))
                .andExpect(status().isAccepted());

        JsonNode done = awaitFinished(id);
        assertThat(done.get("status").asText()).isEqualTo("COMPLETED_WITH_WARNINGS");
        assertThat(done.get("steps").get(0).get("status").asText()).isEqualTo("WARNING");
        assertThat(done.get("steps").get(1).get("attempts").asInt()).isEqualTo(2);
        assertThat(syncroCalls).hasSize(2);
        assertThat(syncroCalls.get(1).participants()).hasSize(2);
    }

    @Test
    void validatesRequest() throws Exception {
        mvc.perform(post("/api/project-kickoffs").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"projectKey\":\"Rossz Kulcs\",\"projectManagerEmail\":\"nem-email\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.length()").value(3));

        mvc.perform(post("/api/project-kickoffs").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"A\",\"projectKey\":\"abc\",\"projectManagerEmail\":\"pm@ceg.hu\","
                                + "\"integrations\":[\"DRIVE\"]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Nincs bekapcsolva: [DRIVE]"));
    }

    private long create(String body) throws Exception {
        String response = mvc.perform(post("/api/project-kickoffs").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return json.readTree(response).get("id").asLong();
    }

    private JsonNode awaitFinished(long id) throws Exception {
        for (int i = 0; i < 100; i++) {
            String response = mvc.perform(get("/api/project-kickoffs/{id}", id))
                    .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
            JsonNode node = json.readTree(response);
            String status = node.get("status").asText();
            if (!status.equals("PENDING") && !status.equals("RUNNING")) {
                return node;
            }
            Thread.sleep(50);
        }
        throw new AssertionError("Nem fejeződött be időben: " + id);
    }
}
