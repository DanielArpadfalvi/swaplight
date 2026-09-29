package com.example.projectkickoff.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ProjectKickoffRepository extends JpaRepository<ProjectKickoff, Long> {

    boolean existsByProjectKeyIgnoreCase(String projectKey);

    List<ProjectKickoff> findTop50ByOrderByCreatedAtDesc();

    List<ProjectKickoff> findByStatusIn(Collection<KickoffStatus> statuses);
}
