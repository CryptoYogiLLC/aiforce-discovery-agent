package scanner

import (
	"fmt"
	"net"
	"sort"
)

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
