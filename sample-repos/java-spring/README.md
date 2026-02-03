# Sample Spring Boot API

A sample Java/Spring Boot REST API for the Discovery Agent dry-run testing.

## Features

- Spring Boot 3.2.0
- Spring Data JPA with PostgreSQL
- Spring Security with JWT authentication
- RESTful API design
- Bean validation

## Expected Discoveries

When analyzed by the Code Analyzer, this repository should produce:

### Dependencies

- Spring Boot 3.2.0 (Web Framework)
- PostgreSQL (Database)
- Spring Security (Authentication)

### Security Findings

- `log4j-core@2.14.1` has critical CVE-2021-44228 (Log4Shell)

### Code Metrics

- ~800 lines of Java code
- 4 JPA entities
- 3 repositories
- RESTful controllers with validation

## Building

```bash
# Build with Maven
mvn clean package

# Run
java -jar target/sample-spring-api-1.0.0.jar

# Run tests
mvn test
```

## Environment Variables

| Variable                   | Description         | Default                                 |
| -------------------------- | ------------------- | --------------------------------------- |
| SPRING_DATASOURCE_URL      | PostgreSQL JDBC URL | jdbc:postgresql://localhost:5432/sample |
| SPRING_DATASOURCE_USERNAME | Database username   | postgres                                |
| SPRING_DATASOURCE_PASSWORD | Database password   | postgres                                |
| JWT_SECRET                 | JWT signing secret  | default-secret                          |
