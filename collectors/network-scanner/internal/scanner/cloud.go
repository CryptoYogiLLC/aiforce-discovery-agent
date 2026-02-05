// Package scanner provides network scanning functionality.
// cloud.go implements cloud provider detection based on IP ranges.
package scanner

import (
	_ "embed"
	"encoding/json"
	"net"
	"sync"
)

// CloudProvider represents a cloud provider name.
type CloudProvider string

const (
	CloudProviderAWS     CloudProvider = "aws"
	CloudProviderAzure   CloudProvider = "azure"
	CloudProviderGCP     CloudProvider = "gcp"
	CloudProviderOther   CloudProvider = "other"
	CloudProviderNone    CloudProvider = "none"
	CloudProviderUnknown CloudProvider = "unknown"
)

// HostingModel represents the inferred hosting model.
type HostingModel string

const (
	HostingModelCloud      HostingModel = "cloud"
	HostingModelOnPremises HostingModel = "on_premises"
	HostingModelHybrid     HostingModel = "hybrid"
	HostingModelUnknown    HostingModel = "unknown"
)

// CloudDetectionResult contains cloud provider detection results.
type CloudDetectionResult struct {
	Provider     CloudProvider `json:"cloud_provider"`
	HostingModel HostingModel  `json:"hosting_model"`
	Region       string        `json:"region,omitempty"`
	Confidence   float64       `json:"confidence"`
}

// cloudIPRanges stores parsed cloud provider IP ranges.
type cloudIPRanges struct {
	AWS   []ipRange `json:"aws"`
	Azure []ipRange `json:"azure"`
	GCP   []ipRange `json:"gcp"`
}

type ipRange struct {
	CIDR   string `json:"cidr"`
	Region string `json:"region,omitempty"`
}

// Embed the cloud IP ranges data file at compile time.
// This file should be placed in data/cloud_ip_ranges.json
// For now, we use a fallback with common ranges.
//
//go:embed data/cloud_ip_ranges.json
var cloudIPRangesData []byte

// CloudDetector detects cloud providers from IP addresses.
type CloudDetector struct {
	awsNets   []*net.IPNet
	azureNets []*net.IPNet
	gcpNets   []*net.IPNet
	regions   map[string]string // CIDR -> region mapping
	mu        sync.RWMutex
	loaded    bool
}

// NewCloudDetector creates a new cloud detector.
func NewCloudDetector() *CloudDetector {
	cd := &CloudDetector{
		regions: make(map[string]string),
	}
	cd.loadRanges()
	return cd
}

// loadRanges loads IP ranges from embedded data or fallback.
func (cd *CloudDetector) loadRanges() {
	cd.mu.Lock()
	defer cd.mu.Unlock()

	if cd.loaded {
		return
	}

	var ranges cloudIPRanges

	// Try to parse embedded data
	if len(cloudIPRangesData) > 0 {
		if err := json.Unmarshal(cloudIPRangesData, &ranges); err == nil {
			cd.parseRanges(ranges)
			cd.loaded = true
			return
		}
	}

	// Fallback to hardcoded common ranges
	cd.loadFallbackRanges()
	cd.loaded = true
}

// loadFallbackRanges loads minimal hardcoded ranges as fallback.
func (cd *CloudDetector) loadFallbackRanges() {
	// AWS common ranges (subset)
	awsCIDRs := []string{
		"3.0.0.0/8",
		"13.32.0.0/14",
		"18.0.0.0/8",
		"34.192.0.0/10",
		"35.156.0.0/14",
		"52.0.0.0/10",
		"54.0.0.0/8",
		"99.77.0.0/16",
		"100.20.0.0/14",
		"107.20.0.0/14",
		"174.129.0.0/16",
		"176.32.96.0/19",
	}

	// Azure common ranges (subset)
	azureCIDRs := []string{
		"13.64.0.0/11",
		"20.0.0.0/8",
		"40.64.0.0/10",
		"51.104.0.0/14",
		"52.224.0.0/11",
		"65.52.0.0/14",
		"70.37.0.0/16",
		"104.40.0.0/13",
		"137.116.0.0/14",
		"168.61.0.0/16",
		"191.232.0.0/14",
	}

	// GCP common ranges (subset)
	gcpCIDRs := []string{
		"8.34.208.0/20",
		"34.64.0.0/10",
		"35.184.0.0/13",
		"35.192.0.0/12",
		"35.208.0.0/12",
		"35.224.0.0/12",
		"35.240.0.0/13",
		"104.196.0.0/14",
		"107.167.160.0/19",
		"108.59.80.0/20",
		"130.211.0.0/16",
		"146.148.0.0/17",
	}

	for _, cidr := range awsCIDRs {
		if _, ipnet, err := net.ParseCIDR(cidr); err == nil {
			cd.awsNets = append(cd.awsNets, ipnet)
		}
	}

	for _, cidr := range azureCIDRs {
		if _, ipnet, err := net.ParseCIDR(cidr); err == nil {
			cd.azureNets = append(cd.azureNets, ipnet)
		}
	}

	for _, cidr := range gcpCIDRs {
		if _, ipnet, err := net.ParseCIDR(cidr); err == nil {
			cd.gcpNets = append(cd.gcpNets, ipnet)
		}
	}
}

// parseRanges parses IP ranges from the data structure.
func (cd *CloudDetector) parseRanges(ranges cloudIPRanges) {
	for _, r := range ranges.AWS {
		if _, ipnet, err := net.ParseCIDR(r.CIDR); err == nil {
			cd.awsNets = append(cd.awsNets, ipnet)
			if r.Region != "" {
				cd.regions[r.CIDR] = r.Region
			}
		}
	}

	for _, r := range ranges.Azure {
		if _, ipnet, err := net.ParseCIDR(r.CIDR); err == nil {
			cd.azureNets = append(cd.azureNets, ipnet)
			if r.Region != "" {
				cd.regions[r.CIDR] = r.Region
			}
		}
	}

	for _, r := range ranges.GCP {
		if _, ipnet, err := net.ParseCIDR(r.CIDR); err == nil {
			cd.gcpNets = append(cd.gcpNets, ipnet)
			if r.Region != "" {
				cd.regions[r.CIDR] = r.Region
			}
		}
	}
}

// Detect determines the cloud provider for an IP address.
func (cd *CloudDetector) Detect(ipStr string) CloudDetectionResult {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return CloudDetectionResult{
			Provider:     CloudProviderUnknown,
			HostingModel: HostingModelUnknown,
			Confidence:   0,
		}
	}

	cd.mu.RLock()
	defer cd.mu.RUnlock()

	// Check private/reserved ranges first
	if isPrivateIP(ip) {
		return CloudDetectionResult{
			Provider:     CloudProviderNone,
			HostingModel: HostingModelOnPremises,
			Confidence:   0.9,
		}
	}

	// Check cloud provider ranges
	if provider, region := cd.matchProvider(ip); provider != CloudProviderNone {
		return CloudDetectionResult{
			Provider:     provider,
			HostingModel: HostingModelCloud,
			Region:       region,
			Confidence:   0.85,
		}
	}

	// Public IP but not in known cloud ranges
	return CloudDetectionResult{
		Provider:     CloudProviderOther,
		HostingModel: HostingModelUnknown,
		Confidence:   0.5,
	}
}

// matchProvider checks if an IP matches any cloud provider range.
func (cd *CloudDetector) matchProvider(ip net.IP) (CloudProvider, string) {
	// Check AWS
	for _, ipnet := range cd.awsNets {
		if ipnet.Contains(ip) {
			return CloudProviderAWS, cd.regions[ipnet.String()]
		}
	}

	// Check Azure
	for _, ipnet := range cd.azureNets {
		if ipnet.Contains(ip) {
			return CloudProviderAzure, cd.regions[ipnet.String()]
		}
	}

	// Check GCP
	for _, ipnet := range cd.gcpNets {
		if ipnet.Contains(ip) {
			return CloudProviderGCP, cd.regions[ipnet.String()]
		}
	}

	return CloudProviderNone, ""
}

// isPrivateIP checks if an IP is in a private/reserved range.
func isPrivateIP(ip net.IP) bool {
	// Private IPv4 ranges
	privateRanges := []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"127.0.0.0/8",
		"169.254.0.0/16",
	}

	for _, cidr := range privateRanges {
		_, ipnet, err := net.ParseCIDR(cidr)
		if err != nil {
			continue
		}
		if ipnet.Contains(ip) {
			return true
		}
	}

	return false
}

// DetectMultiple detects cloud providers for multiple IPs and aggregates results.
func (cd *CloudDetector) DetectMultiple(ips []string) CloudDetectionResult {
	if len(ips) == 0 {
		return CloudDetectionResult{
			Provider:     CloudProviderUnknown,
			HostingModel: HostingModelUnknown,
			Confidence:   0,
		}
	}

	providers := make(map[CloudProvider]int)
	hostingModels := make(map[HostingModel]int)
	var region string

	for _, ip := range ips {
		result := cd.Detect(ip)
		providers[result.Provider]++
		hostingModels[result.HostingModel]++
		if result.Region != "" && region == "" {
			region = result.Region
		}
	}

	// Find dominant provider
	var maxProvider CloudProvider
	var maxCount int
	for p, count := range providers {
		if count > maxCount {
			maxProvider = p
			maxCount = count
		}
	}

	// Determine hosting model
	cloudCount := hostingModels[HostingModelCloud]
	onPremCount := hostingModels[HostingModelOnPremises]

	var hostingModel HostingModel
	if cloudCount > 0 && onPremCount > 0 {
		hostingModel = HostingModelHybrid
	} else if cloudCount > 0 {
		hostingModel = HostingModelCloud
	} else if onPremCount > 0 {
		hostingModel = HostingModelOnPremises
	} else {
		hostingModel = HostingModelUnknown
	}

	confidence := float64(maxCount) / float64(len(ips))

	return CloudDetectionResult{
		Provider:     maxProvider,
		HostingModel: hostingModel,
		Region:       region,
		Confidence:   confidence,
	}
}
