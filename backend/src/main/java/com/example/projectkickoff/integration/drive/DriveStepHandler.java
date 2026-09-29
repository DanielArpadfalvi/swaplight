package com.example.projectkickoff.integration.drive;

import com.example.projectkickoff.config.KickoffProperties;
import com.example.projectkickoff.domain.StepType;
import com.example.projectkickoff.integration.HttpErrors;
import com.example.projectkickoff.integration.StepHandler;
import com.example.projectkickoff.integration.StepResult;
import com.example.projectkickoff.service.ProvisioningContext;
import com.example.projectkickoff.service.ProvisioningContext.Participant;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Projektmappa (+ konfigurált almappák) létrehozása a Drive-on és megosztás a tagokkal.
 */
public class DriveStepHandler implements StepHandler {

    private final GoogleDriveClient client;
    private final KickoffProperties.Drive props;

    public DriveStepHandler(GoogleDriveClient client, KickoffProperties.Drive props) {
        this.client = client;
        this.props = props;
    }

    @Override
    public StepType type() {
        return StepType.DRIVE;
    }

    @Override
    public StepResult execute(ProvisioningContext ctx) {
        List<String> warnings = new ArrayList<>();

        String folderName = props.folderNamePattern()
                .replace("{KEY}", ctx.projectKey().toUpperCase(Locale.ROOT))
                .replace("{key}", ctx.projectKey())
                .replace("{name}", ctx.name());
        GoogleDriveClient.DriveFile folder = client.findOrCreateFolder(props.parentFolderId(), folderName);

        for (String sub : props.subfolders()) {
            client.findOrCreateFolder(folder.id(), sub);
        }

        // Az almappák öröklik a jogosultságot, elég a projektmappát megosztani.
        for (Participant p : ctx.participants()) {
            try {
                client.share(folder.id(), p.email(), role(p), props.sendNotificationEmail());
            } catch (Exception e) {
                warnings.add("Drive: " + p.email() + " megosztása sikertelen (" + HttpErrors.describe(e) + ")");
            }
        }

        return new StepResult(folder.id(), folder.webViewLink(), warnings);
    }

    private static String role(Participant p) {
        return switch (p.role()) {
            case PROJECT_MANAGER, MEMBER -> "writer";
            case VIEWER -> "reader";
        };
    }
}
