package com.example.projectkickoff.integration.drive;

import com.example.projectkickoff.config.KickoffProperties;
import com.example.projectkickoff.integration.GitLabStepHandlerTest;
import com.example.projectkickoff.integration.StepResult;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class DriveStepHandlerTest {

    private static final String API = "https://drive.test/v3";

    @Test
    void createsFolderWithSubfoldersAndShares() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        KickoffProperties.Drive props = new KickoffProperties.Drive(true, null, null, "PARENT",
                "{KEY} - {name}", List.of("01 Szerződés"), false);
        DriveStepHandler handler = new DriveStepHandler(new GoogleDriveClient(builder, API, () -> "tok"), props);

        server.expect(r -> {
                    String q = URLDecoder.decode(r.getURI().getRawQuery(), StandardCharsets.UTF_8);
                    assertThat(r.getURI().getPath()).isEqualTo("/v3/files");
                    assertThat(q).contains("name = 'UGYFELPORTAL - Ügyfélportál' and 'PARENT' in parents");
                })
                .andExpect(header("Authorization", "Bearer tok"))
                .andRespond(withSuccess("{\"files\":[]}", MediaType.APPLICATION_JSON));
        server.expect(r -> assertThat(r.getURI().getPath()).isEqualTo("/v3/files"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.parents[0]").value("PARENT"))
                .andExpect(jsonPath("$.mimeType").value(GoogleDriveClient.FOLDER_MIME))
                .andRespond(withSuccess("{\"id\":\"F1\",\"webViewLink\":\"https://drive/F1\"}", MediaType.APPLICATION_JSON));
        // almappa már létezik
        server.expect(r -> assertThat(URLDecoder.decode(r.getURI().getRawQuery(), StandardCharsets.UTF_8))
                        .contains("name = '01 Szerződés' and 'F1' in parents"))
                .andRespond(withSuccess("{\"files\":[{\"id\":\"S1\"}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(API + "/files/F1/permissions?supportsAllDrives=true&sendNotificationEmail=false"))
                .andExpect(jsonPath("$.role").value("writer"))
                .andExpect(jsonPath("$.emailAddress").value("pm@ceg.hu"))
                .andRespond(withSuccess());
        server.expect(requestTo(API + "/files/F1/permissions?supportsAllDrives=true&sendNotificationEmail=false"))
                .andExpect(jsonPath("$.role").value("writer"))
                .andRespond(withSuccess());
        server.expect(requestTo(API + "/files/F1/permissions?supportsAllDrives=true&sendNotificationEmail=false"))
                .andExpect(jsonPath("$.role").value("reader"))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        StepResult result = handler.execute(GitLabStepHandlerTest.ctx());

        server.verify();
        assertThat(result.url()).isEqualTo("https://drive/F1");
        assertThat(result.warnings()).singleElement().asString().contains("nincs@ceg.hu");
    }

    @Test
    void escapesQuotesInQuery() {
        assertThat(GoogleDriveClient.escape("O'Neil \\ projekt")).isEqualTo("O\\'Neil \\\\ projekt");
    }
}
