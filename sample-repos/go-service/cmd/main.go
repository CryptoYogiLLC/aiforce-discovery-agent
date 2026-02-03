package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/example/sample-go-service/internal/handler"
	"github.com/example/sample-go-service/internal/repository"
	"github.com/example/sample-go-service/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

func main() {
	// Configure logger
	log := logrus.New()
	log.SetFormatter(&logrus.JSONFormatter{})

	if os.Getenv("DEBUG") == "true" {
		log.SetLevel(logrus.DebugLevel)
	}

	// Initialize database
	db, err := repository.NewPostgresDB(repository.DBConfig{
		Host:     getEnv("DB_HOST", "localhost"),
		Port:     getEnv("DB_PORT", "5432"),
		User:     getEnv("DB_USER", "postgres"),
		Password: getEnv("DB_PASSWORD", "postgres"),
		Database: getEnv("DB_NAME", "sample"),
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Initialize repositories
	userRepo := repository.NewUserRepository(db)
	productRepo := repository.NewProductRepository(db)
	orderRepo := repository.NewOrderRepository(db)

	// Initialize services
	userService := service.NewUserService(userRepo, log)
	productService := service.NewProductService(productRepo, log)
	orderService := service.NewOrderService(orderRepo, productRepo, log)

	// Initialize handlers
	userHandler := handler.NewUserHandler(userService)
	productHandler := handler.NewProductHandler(productService)
	orderHandler := handler.NewOrderHandler(orderService)

	// Setup router
	router := gin.Default()

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	// API routes
	api := router.Group("/api")
	{
		// Auth routes
		auth := api.Group("/auth")
		{
			auth.POST("/register", userHandler.Register)
			auth.POST("/login", userHandler.Login)
		}

		// User routes
		users := api.Group("/users")
		users.Use(handler.AuthMiddleware())
		{
			users.GET("/me", userHandler.GetProfile)
			users.PUT("/me", userHandler.UpdateProfile)
		}

		// Product routes
		products := api.Group("/products")
		{
			products.GET("", productHandler.List)
			products.GET("/:id", productHandler.Get)
			products.POST("", handler.AuthMiddleware(), handler.AdminMiddleware(), productHandler.Create)
			products.PUT("/:id", handler.AuthMiddleware(), handler.AdminMiddleware(), productHandler.Update)
			products.DELETE("/:id", handler.AuthMiddleware(), handler.AdminMiddleware(), productHandler.Delete)
		}

		// Order routes
		orders := api.Group("/orders")
		orders.Use(handler.AuthMiddleware())
		{
			orders.GET("", orderHandler.List)
			orders.GET("/:id", orderHandler.Get)
			orders.POST("", orderHandler.Create)
			orders.POST("/:id/cancel", orderHandler.Cancel)
		}
	}

	// Start server
	port := getEnv("PORT", "8080")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		log.Infof("Server starting on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Info("Server stopped")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
