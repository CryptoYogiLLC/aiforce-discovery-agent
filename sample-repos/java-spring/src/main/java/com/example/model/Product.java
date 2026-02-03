package com.example.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "products")
@EntityListeners(AuditingEntityListener.class)
@Data
@NoArgsConstructor
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank
    @Column(unique = true)
    private String sku;

    @NotBlank
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Positive
    @Column(precision = 10, scale = 2)
    private BigDecimal price;

    @NotBlank
    private String category;

    @Column(name = "stock_quantity")
    private Integer stockQuantity = 0;

    @Enumerated(EnumType.STRING)
    private Status status = Status.ACTIVE;

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;

    public enum Status {
        ACTIVE, INACTIVE, DELETED
    }

    public boolean isAvailable() {
        return status == Status.ACTIVE && stockQuantity > 0;
    }
}
