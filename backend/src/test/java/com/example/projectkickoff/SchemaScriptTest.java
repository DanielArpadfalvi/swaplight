package com.example.projectkickoff;

import com.example.projectkickoff.domain.ProjectKickoffRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

/** Ellenőrzi, hogy a sql/ alatti migrációs szkript egyezik az entitásokkal (Hibernate validate). */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:schema;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.sql.init.mode=always",
        "spring.sql.init.schema-locations=file:sql/V1__project_kickoff.postgresql.sql"
})
class SchemaScriptTest {

    @Autowired
    ProjectKickoffRepository repository;

    @Test
    void migrationScriptMatchesEntities() {
        assertThat(repository.count()).isZero();
    }
}
