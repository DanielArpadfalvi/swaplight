package com.example.projectkickoff.service;

public class KickoffNotFoundException extends RuntimeException {

    public KickoffNotFoundException(Long id) {
        super("Nincs ilyen projektindítás: " + id);
    }
}
