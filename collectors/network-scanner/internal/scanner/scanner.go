// Package scanner implements network scanning functionality.
package scanner

import (
	"context"
	"fmt"
	"sync"

	"github.com/aiforce-discovery-agent/collectors/network-scanner/internal/callback"
	"github.com/aiforce-discovery-agent/collectors/network-scanner/internal/config"
	"github.com/aiforce-discovery-agent/collectors/network-scanner/internal/publisher"
	"go.uber.org/zap"
	"golang.org/x/time/rate"
)

// Scanner performs network discovery operations.
type Scanner struct {
	config        config.ScannerConfig
	publisher     *publisher.Publisher
	logger        *zap.SugaredLogger
	limiter       *rate.Limiter
	fingerprinter *Fingerprinter
	ctx           context.Context
	cancel        context.CancelFunc
	wg            sync.WaitGroup
	running       bool
	mu            sync.RWMutex

	// ADR-007: Autonomous scan support
	reporter *callback.Reporter
}

// New creates a new Scanner instance.
func New(cfg config.ScannerConfig, pub *publisher.Publisher, logger *zap.SugaredLogger) *Scanner {
	ctx, cancel := context.WithCancel(context.Background())

	return &Scanner{
		config:        cfg,
		publisher:     pub,
		logger:        logger,
		limiter:       rate.NewLimiter(rate.Limit(cfg.RateLimit), cfg.RateLimit),
		fingerprinter: NewFingerprinter(),
		ctx:           ctx,
		cancel:        cancel,
	}
}

// Start begins scanning the configured subnets.
func (s *Scanner) Start() error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return fmt.Errorf("scanner already running")
	}
	s.running = true
	s.mu.Unlock()

	s.logger.Info("Starting network scan")

	for _, subnet := range s.config.Subnets {
		s.wg.Add(1)
		go s.scanSubnet(subnet)
	}

	return nil
}

// Stop gracefully stops the scanner.
func (s *Scanner) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}

	s.logger.Info("Stopping scanner")
	s.cancel()
	s.wg.Wait()
	s.running = false
	s.logger.Info("Scanner stopped")
}

// IsRunning returns whether the scanner is currently running.
func (s *Scanner) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.running
}
