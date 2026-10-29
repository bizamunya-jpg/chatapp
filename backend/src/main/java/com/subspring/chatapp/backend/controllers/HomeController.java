package com.subspring.chatapp.backend.controllers;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class HomeController {

    @GetMapping("/")
    public String swaggerHome() {
        return "redirect:/swagger-ui/index.html";
    }
}
