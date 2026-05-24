package com.autovantage;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@SpringBootApplication
@EnableJpaAuditing
public class AutoVantageApplication {

    public static void main(String[] args) {
        SpringApplication.run(AutoVantageApplication.class, args);
    }
}