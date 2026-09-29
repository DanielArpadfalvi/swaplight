package com.example.projectkickoff;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Csak az önálló teszteléshez / demóhoz; a meglévő alkalmazásban a saját @SpringBootApplication osztály van.
 * Demó: {@code mvn spring-boot:test-run -Dspring-boot.run.profiles=demo}
 */
@SpringBootApplication
public class TestApplication {

    public static void main(String[] args) {
        SpringApplication.run(TestApplication.class, args);
    }
}
