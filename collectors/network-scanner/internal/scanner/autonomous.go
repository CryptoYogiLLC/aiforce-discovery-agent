package scanner

import (
	"context"
	"fmt"
	"net"
	"sync/atomic"
	"time"

	"github.com/aiforce-discovery-agent/collectors/network-scanner/internal/callback"
)

// AutonomousScanConfig holds configuration for an autonomous scan (ADR-007).
type AutonomousScanConfig struct {
	ScanID             string
	Subnets            []string
	PortRanges         []string
	RateLimitPPS       int
	TimeoutMS          int
	MaxConcurrentHosts int
	DeadHostThreshold  int
	ProgressURL        string
	CompleteURL        string
	APIKey             string
}

// StartAutonomous begins an autonomous scan with custom config and callbacks (ADR-007).
func (s *Scanner) StartAutonomous(cfg AutonomousScanConfig) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return fmt.Errorf("scanner already running")
	}
	s.running = true

	// Reset context for new scan
	s.ctx, s.cancel = context.WithCancel(context.Background())

	// Apply custom config
	if len(cfg.Subnets) > 0 {
		s.config.Subnets = cfg.Subnets
	}
	if len(cfg.PortRanges) > 0 {
		s.config.PortRanges = cfg.PortRanges
	}
	if cfg.RateLimitPPS > 0 {
		s.config.RateLimit = cfg.RateLimitPPS
		s.limiter = rate.NewLimiter(rate.Limit(cfg.RateLimitPPS), cfg.RateLimitPPS)
	}
	if cfg.TimeoutMS > 0 {
		s.config.Timeout = cfg.TimeoutMS
	}
	if cfg.MaxConcurrentHosts > 0 {
		// Cap to prevent resource exhaustion (DoS via excessive goroutines/file descriptors)
		maxAllowed := 500
		if cfg.MaxConcurrentHosts > maxAllowed {
			s.logger.Warnw("MaxConcurrentHosts exceeds limit, capping",
				"requested", cfg.MaxConcurrentHosts, "max", maxAllowed)
			cfg.MaxConcurrentHosts = maxAllowed
		}
		s.config.Concurrency = cfg.MaxConcurrentHosts
	}
	if cfg.DeadHostThreshold > 0 {
		// Cap to reasonable limit
		maxThreshold := 50
		if cfg.DeadHostThreshold > maxThreshold {
			s.logger.Warnw("DeadHostThreshold exceeds limit, capping",
				"requested", cfg.DeadHostThreshold, "max", maxThreshold)
			cfg.DeadHostThreshold = maxThreshold
		}
		s.config.DeadHostThreshold = cfg.DeadHostThreshold
	}

	// Set up callback reporter
	s.reporter = callback.NewReporter(cfg.ScanID, cfg.ProgressURL, cfg.CompleteURL, cfg.APIKey, s.logger)

	// Set scan ID on publisher for CloudEvent subject
	s.publisher.SetScanID(cfg.ScanID)

	s.mu.Unlock()

	s.logger.Infow("Starting autonomous network scan",
		"scan_id", cfg.ScanID,
		"subnets", cfg.Subnets,
		"port_ranges", cfg.PortRanges,
	)

	// Report initial progress
	if err := s.reporter.ReportProgress("initializing", 0, "Starting network scan"); err != nil {
		s.logger.Warnw("Failed to report initial progress", "error", err)
	}

	// Start scanning in goroutine
	go s.runAutonomousScan()

	return nil
}

func (s *Scanner) runAutonomousScan() {
	// Count total IPs across all subnets for finer-grained progress
	var totalIPs int64
	for _, subnet := range s.config.Subnets {
		_, ipNet, err := net.ParseCIDR(subnet)
		if err != nil {
			continue
		}
		ones, bits := ipNet.Mask.Size()
		totalIPs += 1 << uint(bits-ones)
	}
	var scannedIPs int64

	// Start periodic progress reporter (every 10s) so the UI stays updated
	progressDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if s.reporter != nil {
					progress := 0
					if totalIPs > 0 {
						progress = int((atomic.LoadInt64(&scannedIPs) * 100) / totalIPs)
					}
					if progress > 99 {
						progress = 99 // Reserve 100 for completion
					}
					scanned := atomic.LoadInt64(&scannedIPs)
					msg := fmt.Sprintf("Scanned %d/%d hosts", scanned, totalIPs)
					_ = s.reporter.ReportProgress("port_scanning", progress, msg)
				}
			case <-progressDone:
				return
			case <-s.ctx.Done():
				return
			}
		}
	}()

	for _, subnet := range s.config.Subnets {
		select {
		case <-s.ctx.Done():
			close(progressDone)
			s.finishAutonomousScan("cancelled", "Scan was cancelled")
			return
		default:
		}

		// Report subnet start
		if s.reporter != nil {
			scanned := atomic.LoadInt64(&scannedIPs)
			msg := fmt.Sprintf("Scanning %s (%d/%d hosts done)", subnet, scanned, totalIPs)
			_ = s.reporter.ReportProgress("port_scanning", int((scanned*100)/totalIPs), msg)
		}

		s.wg.Add(1)
		s.scanSubnetAutonomous(subnet, &scannedIPs)
	}

	close(progressDone)
	s.wg.Wait()

	// Check if discoveries were published successfully
	if s.reporter != nil && s.reporter.GetDiscoveryCount() == 0 {
		s.logger.Warnw("Scan completed with zero published discoveries")
	}
	s.finishAutonomousScan("completed", "")
}

func (s *Scanner) finishAutonomousScan(status string, errorMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.running = false

	// Clear scan ID from publisher
	s.publisher.SetScanID("")

	// Send completion callback
	if s.reporter != nil {
		if err := s.reporter.ReportComplete(status, errorMsg); err != nil {
			s.logger.Errorw("Failed to report completion", "error", err)
		}
		s.logger.Infow("Autonomous scan finished",
			"status", status,
			"discovery_count", s.reporter.GetDiscoveryCount(),
		)
		s.reporter = nil
	}
}
