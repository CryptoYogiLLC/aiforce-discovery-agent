// Package api provides the HTTP API for the network scanner service.
package api

// StartScanRequest represents the request body for starting an autonomous scan.
// Reference: ADR-007 Discovery Acquisition Model
type StartScanRequest struct {
	ScanID             string   `json:"scan_id" binding:"required,uuid"`
	Subnets            []string `json:"subnets" binding:"required,min=1"`
	PortRanges         []string `json:"port_ranges"`
	RateLimitPPS       int      `json:"rate_limit_pps"`
	TimeoutMS          int      `json:"timeout_ms"`
	MaxConcurrentHosts int      `json:"max_concurrent_hosts"`
	DeadHostThreshold  int      `json:"dead_host_threshold"`
	ProgressURL        string   `json:"progress_url" binding:"required,url"`
	CompleteURL        string   `json:"complete_url" binding:"required,url"`
}

// StopScanRequest represents the request body for stopping a scan.
type StopScanRequest struct {
	ScanID string `json:"scan_id" binding:"required,uuid"`
}

// ScanProgress represents progress data sent to the callback URL.
type ScanProgress struct {
	ScanID         string `json:"scan_id"`
	Collector      string `json:"collector"`
	Sequence       int    `json:"sequence"`
	Phase          string `json:"phase,omitempty"`
	Progress       int    `json:"progress"`
	DiscoveryCount int    `json:"discovery_count"`
	Message        string `json:"message,omitempty"`
	Timestamp      string `json:"timestamp"`
}

// ScanComplete represents completion data sent to the callback URL.
type ScanComplete struct {
	ScanID         string `json:"scan_id"`
	Collector      string `json:"collector"`
	Status         string `json:"status"` // completed, failed, timeout
	DiscoveryCount int    `json:"discovery_count"`
	ErrorMessage   string `json:"error_message,omitempty"`
	Timestamp      string `json:"timestamp"`
}
