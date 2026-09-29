package com.example.projectkickoff.config;

import com.example.projectkickoff.integration.bookstack.BookStackClient;
import com.example.projectkickoff.integration.bookstack.BookStackStepHandler;
import com.example.projectkickoff.integration.drive.DriveStepHandler;
import com.example.projectkickoff.integration.drive.GoogleDriveClient;
import com.example.projectkickoff.integration.gitlab.GitLabClient;
import com.example.projectkickoff.integration.gitlab.GitLabStepHandler;
import com.example.projectkickoff.integration.mattermost.MattermostClient;
import com.example.projectkickoff.integration.mattermost.MattermostStepHandler;
import com.example.projectkickoff.integration.syncro.RestSyncroGateway;
import com.example.projectkickoff.integration.syncro.SyncroGateway;
import com.example.projectkickoff.integration.syncro.SyncroStepHandler;
import com.example.projectkickoff.people.EmptyPersonDirectory;
import com.example.projectkickoff.people.MattermostPersonDirectory;
import com.example.projectkickoff.people.PersonDirectory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.client.RestClient;

/**
 * Az integrációk a {@code kickoff.<integráció>.enabled=true} beállítással kapcsolhatók be egyenként.
 * Ami nincs bekapcsolva, az nem jelenik meg az űrlapon.
 */
@Configuration
@EnableConfigurationProperties(KickoffProperties.class)
public class KickoffConfig {

    @Bean(name = "kickoffTaskExecutor")
    public ThreadPoolTaskExecutor kickoffTaskExecutor(KickoffProperties props) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(props.workerThreads());
        executor.setMaxPoolSize(props.workerThreads());
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("kickoff-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(60);
        return executor;
    }

    // --- GitLab ---

    @Bean
    @ConditionalOnProperty(prefix = "kickoff.gitlab", name = "enabled", havingValue = "true")
    public GitLabClient kickoffGitLabClient(RestClient.Builder builder, KickoffProperties props) {
        return new GitLabClient(builder, props.gitlab());
    }

    @Bean
    @ConditionalOnProperty(prefix = "kickoff.gitlab", name = "enabled", havingValue = "true")
    public GitLabStepHandler kickoffGitLabStepHandler(GitLabClient client, KickoffProperties props) {
        return new GitLabStepHandler(client, props.gitlab());
    }

    // --- Mattermost ---

    @Bean
    @ConditionalOnProperty(prefix = "kickoff.mattermost", name = "enabled", havingValue = "true")
    public MattermostClient kickoffMattermostClient(RestClient.Builder builder, KickoffProperties props) {
        return new MattermostClient(builder, props.mattermost());
    }

    @Bean
    @ConditionalOnProperty(prefix = "kickoff.mattermost", name = "enabled", havingValue = "true")
    public MattermostStepHandler kickoffMattermostStepHandler(MattermostClient client, KickoffProperties props) {
        return new MattermostStepHandler(client, props.mattermost());
    }

    // --- Google Drive ---

    @Bean
    @ConditionalOnProperty(prefix = "kickoff.drive", name = "enabled", havingValue = "true")
    public GoogleDriveClient kickoffDriveClient(RestClient.Builder builder, KickoffProperties props) {
        return new GoogleDriveClient(builder, props.drive());
    }

    @Bean
    @ConditionalOnProperty(prefix = "kickoff.drive", name = "enabled", havingValue = "true")
    public DriveStepHandler kickoffDriveStepHandler(GoogleDriveClient client, KickoffProperties props) {
        return new DriveStepHandler(client, props.drive());
    }

    // --- BookStack ---

    @Bean
    @ConditionalOnProperty(prefix = "kickoff.bookstack", name = "enabled", havingValue = "true")
    public BookStackClient kickoffBookStackClient(RestClient.Builder builder, KickoffProperties props) {
        return new BookStackClient(builder, props.bookstack());
    }

    @Bean
    @ConditionalOnProperty(prefix = "kickoff.bookstack", name = "enabled", havingValue = "true")
    public BookStackStepHandler kickoffBookStackStepHandler(BookStackClient client, KickoffProperties props) {
        return new BookStackStepHandler(client, props.bookstack());
    }

    // --- Syncro ---

    /**
     * Csak akkor jön létre, ha nincs saját {@link SyncroGateway} bean
     * (pl. ha a modul a Syncro-ba épül, ott a belső service-szel kell implementálni).
     */
    @Bean
    @ConditionalOnMissingBean(SyncroGateway.class)
    @ConditionalOnProperty(prefix = "kickoff.syncro", name = "base-url")
    public SyncroGateway kickoffRestSyncroGateway(RestClient.Builder builder, KickoffProperties props) {
        return new RestSyncroGateway(builder, props.syncro());
    }

    @Bean
    @ConditionalOnProperty(prefix = "kickoff.syncro", name = "enabled", havingValue = "true")
    public SyncroStepHandler kickoffSyncroStepHandler(ObjectProvider<SyncroGateway> gateway) {
        return new SyncroStepHandler(gateway.getIfAvailable(() -> {
            throw new IllegalStateException(
                    "kickoff.syncro.enabled=true, de nincs SyncroGateway: adj meg kickoff.syncro.base-url-t "
                            + "vagy implementáld a SyncroGateway interfészt");
        }));
    }

    // --- Személykereső ---

    @Bean
    @ConditionalOnMissingBean(PersonDirectory.class)
    public PersonDirectory kickoffPersonDirectory(ObjectProvider<MattermostClient> mattermost, KickoffProperties props) {
        MattermostClient client = mattermost.getIfAvailable();
        if (client != null && props.mattermost().usePersonDirectory()) {
            return new MattermostPersonDirectory(client, props.mattermost().teamId());
        }
        return new EmptyPersonDirectory();
    }
}
