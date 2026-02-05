package scanner

import (
	"fmt"
	"net"
	"time"
)

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
