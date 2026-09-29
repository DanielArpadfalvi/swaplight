package com.example.projectkickoff.people;

import java.util.List;

/**
 * Személykereső a projektvezető és a tagok kiválasztásához.
 *
 * <p>Alapból a Mattermost felhasználóiban keres. Ha a meglévő alkalmazásban van saját felhasználó-nyilvántartás
 * (pl. a Syncro felhasználói), érdemes azzal implementálni egy saját {@code @Component}-ként; akkor ez lesz használva.
 */
public interface PersonDirectory {

    List<Person> search(String query, int limit);

    record Person(String email, String displayName) {
    }
}
