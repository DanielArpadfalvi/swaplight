package com.example.projectkickoff.integration;

import org.springframework.web.client.RestClientResponseException;

/** Segédfüggvények a külső API hibák kezeléséhez. */
public final class HttpErrors {

    private HttpErrors() {
    }

    public static boolean isStatus(Throwable e, int status) {
        return e instanceof RestClientResponseException r && r.getStatusCode().value() == status;
    }

    /** Rövid, a felületen megjeleníthető hibaüzenet. */
    public static String describe(Throwable e) {
        if (e instanceof RestClientResponseException r) {
            String body = r.getResponseBodyAsString();
            if (body.length() > 300) {
                body = body.substring(0, 300) + "...";
            }
            return "HTTP " + r.getStatusCode().value() + (body.isBlank() ? "" : ": " + body);
        }
        return e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
    }
}
