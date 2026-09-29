package com.example.projectkickoff.integration.drive;

import com.example.projectkickoff.config.KickoffProperties;
import com.example.projectkickoff.integration.IntegrationException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import org.springframework.web.client.RestClient;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * Vékony kliens a Google Drive REST API v3-hoz, service account hitelesítéssel.
 * Shared Drive-okat is támogat (supportsAllDrives).
 */
public class GoogleDriveClient {

    static final String FOLDER_MIME = "application/vnd.google-apps.folder";
    private static final String DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

    private final RestClient http;

    public GoogleDriveClient(RestClient.Builder builder, KickoffProperties.Drive props) {
        this(builder, "https://www.googleapis.com/drive/v3", tokenSupplier(props));
    }

    /** Teszteléshez: tetszőleges base URL és token. */
    GoogleDriveClient(RestClient.Builder builder, String baseUrl, Supplier<String> accessToken) {
        this.http = builder
                .baseUrl(baseUrl)
                .requestInterceptor((request, body, execution) -> {
                    request.getHeaders().setBearerAuth(accessToken.get());
                    return execution.execute(request, body);
                })
                .build();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DriveFile(String id, String name, String webViewLink) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record FileList(List<DriveFile> files) {
    }

    public Optional<DriveFile> findFolder(String parentId, String name) {
        String q = "name = '" + escape(name) + "' and '" + escape(parentId) + "' in parents"
                + " and mimeType = '" + FOLDER_MIME + "' and trashed = false";
        FileList list = http.get()
                .uri(b -> b.path("/files")
                        .queryParam("q", "{q}")
                        .queryParam("fields", "files(id,name,webViewLink)")
                        .queryParam("supportsAllDrives", true)
                        .queryParam("includeItemsFromAllDrives", true)
                        .queryParam("corpora", "allDrives")
                        .build(q))
                .retrieve()
                .body(FileList.class);
        return list == null || list.files() == null ? Optional.empty() : list.files().stream().findFirst();
    }

    public DriveFile createFolder(String parentId, String name) {
        return http.post()
                .uri(b -> b.path("/files")
                        .queryParam("fields", "id,name,webViewLink")
                        .queryParam("supportsAllDrives", true)
                        .build())
                .body(Map.of("name", name, "mimeType", FOLDER_MIME, "parents", List.of(parentId)))
                .retrieve()
                .body(DriveFile.class);
    }

    public DriveFile findOrCreateFolder(String parentId, String name) {
        return findFolder(parentId, name).orElseGet(() -> createFolder(parentId, name));
    }

    /**
     * Jogosultság adása. Ugyanarra a felhasználóra ismételt hívás nem hoz létre duplikátumot,
     * a Drive a meglévőt frissíti.
     *
     * @param role reader | commenter | writer | fileOrganizer (Shared Drive)
     */
    public void share(String fileId, String email, String role, boolean notify) {
        http.post()
                .uri(b -> b.path("/files/{id}/permissions")
                        .queryParam("supportsAllDrives", true)
                        .queryParam("sendNotificationEmail", notify)
                        .build(fileId))
                .body(Map.of("type", "user", "role", role, "emailAddress", email))
                .retrieve()
                .toBodilessEntity();
    }

    static String escape(String s) {
        return s.replace("\\", "\\\\").replace("'", "\\'");
    }

    private static Supplier<String> tokenSupplier(KickoffProperties.Drive props) {
        GoogleCredentials credentials;
        try (InputStream in = new FileInputStream(props.credentialsFile())) {
            credentials = GoogleCredentials.fromStream(in).createScoped(List.of(DRIVE_SCOPE));
        } catch (IOException e) {
            throw new IllegalStateException("Nem olvasható a Drive credentials fájl: " + props.credentialsFile(), e);
        }
        if (props.impersonateUser() != null && !props.impersonateUser().isBlank()) {
            if (!(credentials instanceof ServiceAccountCredentials sa)) {
                throw new IllegalStateException("Az impersonate-user csak service account kulccsal használható");
            }
            credentials = sa.createDelegated(props.impersonateUser());
        }
        GoogleCredentials creds = credentials;
        return () -> {
            try {
                creds.refreshIfExpired();
                return creds.getAccessToken().getTokenValue();
            } catch (IOException e) {
                throw new IntegrationException("Google hitelesítés sikertelen: " + e.getMessage(), e);
            }
        };
    }
}
