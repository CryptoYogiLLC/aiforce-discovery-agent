// Package api provides the HTTP API for the network scanner service.
package api

import (
	"net/http"

	"github.com/aiforce-discovery-agent/collectors/network-scanner/internal/config"
	"github.com/aiforce-discovery-agent/collectors/network-scanner/internal/scanner"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// Server represents the HTTP API server.
type Server struct {
	config  config.ServerConfig
	scanner *scanner.Scanner
	logger  *zap.SugaredLogger
	router  *gin.Engine
}

// New creates a new API server.
func New(cfg config.ServerConfig, scan *scanner.Scanner, logger *zap.SugaredLogger) *Server {
	gin.SetMode(gin.ReleaseMode)

	s := &Server{
		config:  cfg,
		scanner: scan,
		logger:  logger,
		router:  gin.New(),
	}

	s.setupRoutes()
	return s
}

// Router returns the gin router.
func (s *Server) Router() *gin.Engine {
	return s.router
}

func (s *Server) setupRoutes() {
	// Middleware
	s.router.Use(gin.Recovery())
	s.router.Use(s.loggingMiddleware())

	// Health endpoints
	s.router.GET("/health", s.healthHandler)
	s.router.GET("/ready", s.readyHandler)

	// API v1
	v1 := s.router.Group("/api/v1")
	{
		// Scanner control
		v1.POST("/scan/start", s.startScanHandler)
		v1.POST("/scan/stop", s.stopScanHandler)
		v1.GET("/scan/status", s.scanStatusHandler)

		// Target scanning
		v1.POST("/scan/target", s.scanTargetHandler)
	}

	// Metrics endpoint (placeholder)
	s.router.GET("/metrics", s.metricsHandler)
}

func (s *Server) loggingMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := c.Request.URL.Path

		c.Next()

		s.logger.Debugw("Request completed",
			"path", start,
			"status", c.Writer.Status(),
			"method", c.Request.Method,
		)
	}
}

// Health check handler
func (s *Server) healthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "healthy",
		"service": "network-scanner",
	})
}

// Readiness check handler
func (s *Server) readyHandler(c *gin.Context) {
	// Check if scanner is operational
	c.JSON(http.StatusOK, gin.H{
		"status":  "ready",
		"service": "network-scanner",
	})
}

// Start scan handler - supports both legacy (no body) and autonomous (with body) modes
func (s *Server) startScanHandler(c *gin.Context) {
	var req StartScanRequest

	// Try to parse request body for autonomous mode (ADR-007)
	if err := c.ShouldBindJSON(&req); err == nil && req.ScanID != "" {
		// Autonomous mode - start with custom config
		cfg := scanner.AutonomousScanConfig{
			ScanID:             req.ScanID,
			Subnets:            req.Subnets,
			PortRanges:         req.PortRanges,
			RateLimitPPS:       req.RateLimitPPS,
			TimeoutMS:          req.TimeoutMS,
			MaxConcurrentHosts: req.MaxConcurrentHosts,
			DeadHostThreshold:  req.DeadHostThreshold,
			ProgressURL:        req.ProgressURL,
			CompleteURL:        req.CompleteURL,
			APIKey:             c.GetHeader("X-Internal-API-Key"),
		}

		if err := s.scanner.StartAutonomous(cfg); err != nil {
			c.JSON(http.StatusConflict, gin.H{
				"error": err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"status":  "started",
			"message": "Autonomous network scan started",
			"scan_id": req.ScanID,
		})
		return
	}

	// Legacy mode - start with configured defaults
	if err := s.scanner.Start(); err != nil {
		c.JSON(http.StatusConflict, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "started",
		"message": "Network scan started",
	})
}

// Stop scan handler
func (s *Server) stopScanHandler(c *gin.Context) {
	// Check for scan_id in request body (ADR-007)
	var req StopScanRequest
	if err := c.ShouldBindJSON(&req); err == nil && req.ScanID != "" {
		s.logger.Infow("Stop scan requested", "scan_id", req.ScanID)
	}

	s.scanner.Stop()
	c.JSON(http.StatusOK, gin.H{
		"status":  "stopped",
		"message": "Network scan stopped",
	})
}

// Scan status handler
func (s *Server) scanStatusHandler(c *gin.Context) {
	running := s.scanner.IsRunning()
	status := "idle"
	if running {
		status = "running"
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  status,
		"running": running,
	})
}

// Scan target handler - scans a specific IP address
func (s *Server) scanTargetHandler(c *gin.Context) {
	var req struct {
		Target string `json:"target" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "target IP address required",
		})
		return
	}

	results, err := s.scanner.ScanTarget(req.Target)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"target":  req.Target,
		"results": results,
		"count":   len(results),
	})
}

// Metrics handler (placeholder for Prometheus metrics)
func (s *Server) metricsHandler(c *gin.Context) {
	// Placeholder - will be implemented with Prometheus client
	c.String(http.StatusOK, "# Metrics placeholder\n")
}
