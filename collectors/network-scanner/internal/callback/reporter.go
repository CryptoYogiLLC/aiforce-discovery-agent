// Package callback handles progress and completion reporting to approval-api.
// Reference: ADR-007 Discovery Acquisition Model
package callback

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync/atomic"
	"time"

	"go.uber.org/zap"
)

// Reporter sends progress and completion callbacks to approval-api.
type Reporter struct {
	scanID         string
	progressURL    string
	completeURL    string
	apiKey         string
	logger         *zap.SugaredLogger
	client         *http.Client
	sequence       int64 // Monotonic counter for idempotency
	discoveryCount int64
}

// Progress represents a progress update.
type Progress struct {
	ScanID         string `json:"scan_id"`
	Collector      string `json:"collector"`
	Sequence       int    `json:"sequence"`
	Phase          string `json:"phase,omitempty"`
	Progress       int    `json:"progress"`
	DiscoveryCount int    `json:"discovery_count"`
	Message        string `json:"message,omitempty"`
	Timestamp      string `json:"timestamp"`
}

// Completion represents a scan completion.
type Completion struct {
	ScanID         string `json:"scan_id"`
	Collector      string `json:"collector"`
	Status         string `json:"status"` // completed, failed, timeout
	DiscoveryCount int    `json:"discovery_count"`
	ErrorMessage   string `json:"error_message,omitempty"`
	Timestamp      string `json:"timestamp"`
}

// NewReporter creates a new callback reporter.
func NewReporter(scanID, progressURL, completeURL, apiKey string, logger *zap.SugaredLogger) *Reporter {
	return &Reporter{
		scanID:      scanID,
		progressURL: progressURL,
		completeURL: completeURL,
		apiKey:      apiKey,
		logger:      logger,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// ReportProgress sends a progress update.
func (r *Reporter) ReportProgress(phase string, progress int, message string) error {
	seq := atomic.AddInt64(&r.sequence, 1)
	count := atomic.LoadInt64(&r.discoveryCount)

	payload := Progress{
		ScanID:         r.scanID,
		Collector:      "network-scanner",
		Sequence:       int(seq),
		Phase:          phase,
		Progress:       progress,
		DiscoveryCount: int(count),
		Message:        message,
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
	}

	return r.sendCallback(r.progressURL, payload)
}

// ReportComplete sends a completion callback.
func (r *Reporter) ReportComplete(status string, errorMsg string) error {
	count := atomic.LoadInt64(&r.discoveryCount)

	payload := Completion{
		ScanID:         r.scanID,
		Collector:      "network-scanner",
		Status:         status,
		DiscoveryCount: int(count),
		ErrorMessage:   errorMsg,
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
	}

	return r.sendCallback(r.completeURL, payload)
}

// IncrementDiscoveryCount increments the discovery counter.
func (r *Reporter) IncrementDiscoveryCount() {
	atomic.AddInt64(&r.discoveryCount, 1)
}

// GetDiscoveryCount returns the current discovery count.
func (r *Reporter) GetDiscoveryCount() int {
	return int(atomic.LoadInt64(&r.discoveryCount))
}

// GetScanID returns the scan ID.
func (r *Reporter) GetScanID() string {
	return r.scanID
}

func (r *Reporter) sendCallback(url string, payload interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if r.apiKey != "" {
		req.Header.Set("X-Internal-API-Key", r.apiKey)
	}

	resp, err := r.client.Do(req)
	if err != nil {
		r.logger.Warnw("Callback failed", "url", url, "error", err)
		return fmt.Errorf("callback request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 400 {
		r.logger.Warnw("Callback returned error", "url", url, "status", resp.StatusCode)
		return fmt.Errorf("callback returned status %d", resp.StatusCode)
	}

	r.logger.Debugw("Callback sent", "url", url, "status", resp.StatusCode)
	return nil
}
