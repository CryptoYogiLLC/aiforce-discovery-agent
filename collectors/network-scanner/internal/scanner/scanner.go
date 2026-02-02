// Package scanner implements network scanning functionality.
package scanner

import (
	"context"
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/aiforce-discovery-agent/collectors/network-scanner/internal/config"
	"github.com/aiforce-discovery-agent/collectors/network-scanner/internal/publisher"
	"go.uber.org/zap"
	"golang.org/x/time/rate"
)

// Scanner performs network discovery operations.
type Scanner struct {
	config       config.ScannerConfig
	publisher    *publisher.Publisher
	logger       *zap.SugaredLogger
	limiter      *rate.Limiter
	fingerprinter *Fingerprinter
	ctx          context.Context
	cancel       context.CancelFunc
	wg           sync.WaitGroup
	running      bool
	mu           sync.RWMutex
}

// ScanResult represents the result of scanning a single target.
type ScanResult struct {
	IP        string
	Port      int
	Protocol  string
	Open      bool
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
func (s *Scanner) ScanTarget(ip string) ([]ScanResult, error) {
	var results []ScanResult
	ports := s.expandPortRanges()

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
			results = append(results, result)
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

	address := fmt.Sprintf("%s:%d", ip, port)
	timeout := time.Duration(s.config.Timeout) * time.Millisecond

	conn, err := net.DialTimeout(protocol, address, timeout)
	if err != nil {
		return result
	}
	defer conn.Close()

	result.Open = true

	// Try to grab banner
	conn.SetReadDeadline(time.Now().Add(timeout))
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

	ports := make([]int, 0, len(portSet))
	for port := range portSet {
		ports = append(ports, port)
	}

	return ports
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
