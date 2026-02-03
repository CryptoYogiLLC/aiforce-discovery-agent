// Package scanner implements network scanning functionality.
package scanner

import (
	"context"
	"fmt"
	"net"
	"sort"
	"sync"
	"sync/atomic"
	"time"

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

// ScanResult represents the result of scanning a single target.
type ScanResult struct {
	IP        string
	Port      int
	Protocol  string
	Open      bool
	TimedOut  bool
	Service   string
	Banner    string
	Timestamp time.Time
}

// GetIP returns the IP address.
func (r ScanResult) GetIP() string { return r.IP }

// GetPort returns the port number.
func (r ScanResult) GetPort() int { return r.Port }

// GetProtocol returns the protocol (tcp/udp).
func (r ScanResult) GetProtocol() string { return r.Protocol }

// GetService returns the identified service name.
func (r ScanResult) GetService() string { return r.Service }

// GetBanner returns the service banner.
func (r ScanResult) GetBanner() string { return r.Banner }

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

func (s *Scanner) scanSubnetAutonomous(subnet string, scannedIPs *int64) {
	defer s.wg.Done()

	s.logger.Infow("Scanning subnet", "subnet", subnet)

	_, ipNet, err := net.ParseCIDR(subnet)
	if err != nil {
		s.logger.Errorw("Invalid subnet", "subnet", subnet, "error", err)
		return
	}

	numWorkers := s.config.Concurrency
	if numWorkers <= 0 {
		numWorkers = 100
	}

	ipChan := make(chan string, numWorkers*2)
	var workerWg sync.WaitGroup
	var publishFailures int64
	var openPortsFound int64

	// Start worker pool
	for i := 0; i < numWorkers; i++ {
		workerWg.Add(1)
		go func() {
			defer workerWg.Done()
			for ipStr := range ipChan {
				results, err := s.ScanTarget(ipStr)
				if err != nil {
					if err == context.Canceled {
						return
					}
					s.logger.Warnw("Scan error", "ip", ipStr, "error", err)
					continue
				}

				// Publish results and track discovery count
				for _, result := range results {
					atomic.AddInt64(&openPortsFound, 1)
					if err := s.publisher.PublishServiceDiscovered(result); err != nil {
						atomic.AddInt64(&publishFailures, 1)
						s.logger.Errorw("Failed to publish result", "error", err)
					} else if s.reporter != nil {
						s.reporter.IncrementDiscoveryCount()
					}
				}
			}
		}()
	}

	// Feed IPs into the worker channel
feedLoop:
	for ip := ipNet.IP.Mask(ipNet.Mask); ipNet.Contains(ip); incrementIP(ip) {
		select {
		case <-s.ctx.Done():
			break feedLoop
		default:
		}

		// Copy IP string before sending — incrementIP mutates the underlying bytes
		ipStr := ip.String()
		atomic.AddInt64(scannedIPs, 1)

		if s.isExcluded(ipStr) {
			continue
		}

		select {
		case ipChan <- ipStr:
		case <-s.ctx.Done():
			break feedLoop
		}
	}

	close(ipChan)
	workerWg.Wait()

	// Log if all publishes failed (indicates a systemic issue)
	found := atomic.LoadInt64(&openPortsFound)
	failed := atomic.LoadInt64(&publishFailures)
	if found > 0 && failed == found {
		s.logger.Errorw("All publish attempts failed for subnet",
			"subnet", subnet, "open_ports", found, "failures", failed)
	}
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

// ScanTarget scans a single IP address for open ports.
// Uses dead host detection: after consecutive timeouts exceed the threshold,
// the host is assumed unreachable and remaining ports are skipped.
func (s *Scanner) ScanTarget(ip string) ([]ScanResult, error) {
	var results []ScanResult
	ports := s.expandPortRanges()

	deadHostThreshold := s.config.DeadHostThreshold
	if deadHostThreshold <= 0 {
		deadHostThreshold = 5
	}

	consecutiveTimeouts := 0

	for _, port := range ports {
		select {
		case <-s.ctx.Done():
			return results, s.ctx.Err()
		default:
		}

		// Wait for rate limiter
		if err := s.limiter.Wait(s.ctx); err != nil {
			return results, err
		}

		result := s.scanPort(ip, port, "tcp")
		if result.Open {
			consecutiveTimeouts = 0
			results = append(results, result)
		} else if result.TimedOut {
			consecutiveTimeouts++
			if consecutiveTimeouts >= deadHostThreshold {
				s.logger.Debugw("Host appears dead, skipping remaining ports",
					"ip", ip,
					"consecutive_timeouts", consecutiveTimeouts,
					"ports_scanned", port,
				)
				break
			}
		} else {
			// Connection refused (RST) — host is alive, port is closed
			consecutiveTimeouts = 0
		}
	}

	return results, nil
}

func (s *Scanner) scanSubnet(subnet string) {
	defer s.wg.Done()

	s.logger.Infow("Scanning subnet", "subnet", subnet)

	_, ipNet, err := net.ParseCIDR(subnet)
	if err != nil {
		s.logger.Errorw("Invalid subnet", "subnet", subnet, "error", err)
		return
	}

	// Iterate through all IPs in subnet
	for ip := ipNet.IP.Mask(ipNet.Mask); ipNet.Contains(ip); incrementIP(ip) {
		select {
		case <-s.ctx.Done():
			return
		default:
		}

		ipStr := ip.String()

		// Skip excluded subnets
		if s.isExcluded(ipStr) {
			continue
		}

		results, err := s.ScanTarget(ipStr)
		if err != nil {
			if err == context.Canceled {
				return
			}
			s.logger.Warnw("Scan error", "ip", ipStr, "error", err)
			continue
		}

		// Publish results
		for _, result := range results {
			if err := s.publisher.PublishServiceDiscovered(result); err != nil {
				s.logger.Errorw("Failed to publish result", "error", err)
			}
		}
	}
}

func (s *Scanner) scanPort(ip string, port int, protocol string) ScanResult {
	result := ScanResult{
		IP:        ip,
		Port:      port,
		Protocol:  protocol,
		Open:      false,
		Timestamp: time.Now(),
	}

	address := net.JoinHostPort(ip, fmt.Sprintf("%d", port))
	timeout := time.Duration(s.config.Timeout) * time.Millisecond

	conn, err := net.DialTimeout(protocol, address, timeout)
	if err != nil {
		if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
			result.TimedOut = true
		}
		return result
	}
	defer func() { _ = conn.Close() }()

	result.Open = true

	// Try to grab banner
	if err := conn.SetReadDeadline(time.Now().Add(timeout)); err != nil {
		return result
	}
	buffer := make([]byte, 1024)
	n, _ := conn.Read(buffer)
	if n > 0 {
		result.Banner = string(buffer[:n])
	}

	// Identify service using fingerprinter
	fp := s.fingerprinter.Identify(port, result.Banner)
	result.Service = fp.Name

	return result
}

// databasePriorityPorts are scanned first to quickly identify database services
// and to trigger dead host detection on high-value ports.
var databasePriorityPorts = map[int]bool{
	1433:  true, // MSSQL
	1521:  true, // Oracle
	3306:  true, // MySQL
	5432:  true, // PostgreSQL
	5672:  true, // RabbitMQ
	5984:  true, // CouchDB
	6379:  true, // Redis
	9042:  true, // Cassandra
	9200:  true, // Elasticsearch
	27017: true, // MongoDB
}

func (s *Scanner) expandPortRanges() []int {
	portSet := make(map[int]bool)

	// Add common ports
	for _, port := range s.config.CommonPorts {
		portSet[port] = true
	}

	// Parse port ranges
	for _, rangeStr := range s.config.PortRanges {
		var start, end int
		if n, _ := fmt.Sscanf(rangeStr, "%d-%d", &start, &end); n == 2 {
			for p := start; p <= end; p++ {
				portSet[p] = true
			}
		} else if n, _ := fmt.Sscanf(rangeStr, "%d", &start); n == 1 {
			portSet[start] = true
		}
	}

	// Partition into priority (database) ports first, then the rest
	priority := make([]int, 0)
	rest := make([]int, 0, len(portSet))
	for port := range portSet {
		if databasePriorityPorts[port] {
			priority = append(priority, port)
		} else {
			rest = append(rest, port)
		}
	}

	sort.Ints(priority)
	sort.Ints(rest)

	return append(priority, rest...)
}

func (s *Scanner) isExcluded(ip string) bool {
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return false
	}

	for _, subnet := range s.config.ExcludeSubnets {
		_, ipNet, err := net.ParseCIDR(subnet)
		if err != nil {
			continue
		}
		if ipNet.Contains(parsedIP) {
			return true
		}
	}

	return false
}

func incrementIP(ip net.IP) {
	for j := len(ip) - 1; j >= 0; j-- {
		ip[j]++
		if ip[j] > 0 {
			break
		}
	}
}
