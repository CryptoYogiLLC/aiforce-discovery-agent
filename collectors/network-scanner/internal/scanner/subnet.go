package scanner

import (
	"context"
	"net"
	"sync"
	"sync/atomic"
)

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
