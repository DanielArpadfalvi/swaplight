package com.example.projectkickoff.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SlugsTest {

    @Test
    void removesHungarianAccentsAndSpecialChars() {
        assertThat(Slugs.toSlug("Új Ügyfélportál 2.0")).isEqualTo("uj-ugyfelportal-2-0");
        assertThat(Slugs.toSlug("  Árvíztűrő tükörfúrógép!! ")).isEqualTo("arvizturo-tukorfurogep");
    }

    @Test
    void resultMatchesKeyRegex() {
        String slug = Slugs.toSlug("Nagyon hosszú projekt név, ami bőven több mint ötven karakter hosszú");
        assertThat(slug).hasSizeLessThanOrEqualTo(50).matches(Slugs.KEY_REGEX);
    }
}
