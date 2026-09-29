package com.example.projectkickoff.people;

import java.util.List;

/** Ha nincs személykereső, a felületen kézzel kell beírni az e-mail címeket. */
public class EmptyPersonDirectory implements PersonDirectory {

    @Override
    public List<Person> search(String query, int limit) {
        return List.of();
    }
}
