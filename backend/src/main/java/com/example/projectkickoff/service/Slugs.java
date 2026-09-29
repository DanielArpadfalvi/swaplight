package com.example.projectkickoff.service;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

public final class Slugs {

    /** Érvényes projektkulcs: kisbetű, szám, kötőjel; 3-50 karakter; betűvel/számmal kezdődik és végződik. */
    public static final String KEY_REGEX = "^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$";

    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");
    private static final Pattern NON_SLUG = Pattern.compile("[^a-z0-9]+");

    private Slugs() {
    }

    /** "Új Ügyfélportál 2.0" -> "uj-ugyfelportal-2-0" */
    public static String toSlug(String text) {
        if (text == null) {
            return "";
        }
        String s = Normalizer.normalize(text, Normalizer.Form.NFD);
        s = DIACRITICS.matcher(s).replaceAll("").toLowerCase(Locale.ROOT);
        s = NON_SLUG.matcher(s).replaceAll("-");
        s = s.replaceAll("^-+|-+$", "");
        if (s.length() > 50) {
            s = s.substring(0, 50).replaceAll("-+$", "");
        }
        return s;
    }
}
