package com.example.repository;

import com.example.model.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Repository
public interface ProductRepository extends JpaRepository<Product, Long> {

    Optional<Product> findBySku(String sku);

    boolean existsBySku(String sku);

    Page<Product> findByStatus(Product.Status status, Pageable pageable);

    Page<Product> findByStatusAndCategory(Product.Status status, String category, Pageable pageable);

    @Query("SELECT p FROM Product p WHERE p.status = :status AND p.price BETWEEN :minPrice AND :maxPrice")
    Page<Product> findByStatusAndPriceRange(
        @Param("status") Product.Status status,
        @Param("minPrice") BigDecimal minPrice,
        @Param("maxPrice") BigDecimal maxPrice,
        Pageable pageable
    );

    @Query("SELECT p FROM Product p WHERE p.status = 'ACTIVE' AND p.stockQuantity <= :threshold")
    List<Product> findLowStockProducts(@Param("threshold") int threshold);

    @Query("SELECT DISTINCT p.category FROM Product p WHERE p.status = 'ACTIVE'")
    List<String> findAllCategories();
}
