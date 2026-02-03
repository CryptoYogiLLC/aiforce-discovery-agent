package com.example.service;

import com.example.model.Product;
import com.example.repository.ProductRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;

    public Page<Product> findAll(Pageable pageable) {
        return productRepository.findByStatus(Product.Status.ACTIVE, pageable);
    }

    public Page<Product> findByCategory(String category, Pageable pageable) {
        return productRepository.findByStatusAndCategory(Product.Status.ACTIVE, category, pageable);
    }

    public Page<Product> findByPriceRange(BigDecimal minPrice, BigDecimal maxPrice, Pageable pageable) {
        return productRepository.findByStatusAndPriceRange(Product.Status.ACTIVE, minPrice, maxPrice, pageable);
    }

    public Product findById(Long id) {
        return productRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + id));
    }

    public Product findBySku(String sku) {
        return productRepository.findBySku(sku)
            .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + sku));
    }

    @Transactional
    public Product create(Product product) {
        if (productRepository.existsBySku(product.getSku())) {
            throw new DuplicateResourceException("SKU already exists: " + product.getSku());
        }
        return productRepository.save(product);
    }

    @Transactional
    public Product update(Long id, Product updates) {
        Product product = findById(id);

        if (updates.getName() != null) {
            product.setName(updates.getName());
        }
        if (updates.getDescription() != null) {
            product.setDescription(updates.getDescription());
        }
        if (updates.getPrice() != null) {
            product.setPrice(updates.getPrice());
        }
        if (updates.getCategory() != null) {
            product.setCategory(updates.getCategory());
        }
        if (updates.getStockQuantity() != null) {
            product.setStockQuantity(updates.getStockQuantity());
        }

        return productRepository.save(product);
    }

    @Transactional
    public void updateStock(Long id, int quantity) {
        Product product = findById(id);
        int newQuantity = product.getStockQuantity() + quantity;

        if (newQuantity < 0) {
            throw new IllegalArgumentException("Insufficient stock");
        }

        product.setStockQuantity(newQuantity);
        productRepository.save(product);
    }

    @Transactional
    public void delete(Long id) {
        Product product = findById(id);
        product.setStatus(Product.Status.DELETED);
        productRepository.save(product);
    }

    public List<Product> findLowStockProducts(int threshold) {
        return productRepository.findLowStockProducts(threshold);
    }

    public List<String> getAllCategories() {
        return productRepository.findAllCategories();
    }

    // Custom exceptions
    public static class ResourceNotFoundException extends RuntimeException {
        public ResourceNotFoundException(String message) {
            super(message);
        }
    }

    public static class DuplicateResourceException extends RuntimeException {
        public DuplicateResourceException(String message) {
            super(message);
        }
    }
}
