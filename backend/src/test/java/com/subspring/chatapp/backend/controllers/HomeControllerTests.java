package com.subspring.chatapp.backend.controllers;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class HomeControllerTests {

    @Test
    void redirectsRootToSwaggerUi() {
        assertEquals("redirect:/swagger-ui/index.html", new HomeController().swaggerHome());
    }
}
