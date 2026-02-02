// Package main is the entry point for the network scanner service.
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/aiforce-discovery-agent/collectors/network-scanner/internal/api"
	"github.com/aiforce-discovery-agent/collectors/network-scanner/internal/config"
	"github.com/aiforce-discovery-agent/collectors/network-scanner/internal/publisher"
	"github.com/aiforce-discovery-agent/collectors/network-scanner/internal/scanner"
	"go.uber.org/zap"
)

func main() {
	// Initialize logger
	logger, err := zap.NewProduction()
	if err != nil {
		fmt.Printf("failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	sugar := logger.Sugar()
	sugar.Info("Starting network scanner service")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		sugar.Fatalf("Failed to load configuration: %v", err)
	}

	sugar.Infow("Configuration loaded",
		"port", cfg.Server.Port,
		"subnets", cfg.Scanner.Subnets,
		"rate_limit", cfg.Scanner.RateLimit,
	)

	// Initialize RabbitMQ publisher
	pub, err := publisher.New(cfg.RabbitMQ.URL, sugar)
	if err != nil {
		sugar.Fatalf("Failed to initialize publisher: %v", err)
	}
	defer pub.Close()

	// Initialize scanner
	scan := scanner.New(cfg.Scanner, pub, sugar)

	// Initialize API server
	server := api.New(cfg.Server, scan, sugar)

	// Create HTTP server
	httpServer := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      server.Router(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		sugar.Infof("HTTP server listening on port %d", cfg.Server.Port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			sugar.Fatalf("HTTP server error: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	sugar.Info("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Stop scanner
	scan.Stop()

	// Shutdown HTTP server
	if err := httpServer.Shutdown(ctx); err != nil {
		sugar.Errorf("Server forced to shutdown: %v", err)
	}

	sugar.Info("Server stopped")
}
