// Package publisher handles publishing discovery events to RabbitMQ.
package publisher

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"
)

// Publisher sends CloudEvents to RabbitMQ.
type Publisher struct {
	conn     *amqp.Connection
	channel  *amqp.Channel
	exchange string
	logger   *zap.SugaredLogger
	scanID   string // ADR-007: Current scan ID for CloudEvent subject
}

// CloudEvent represents the CloudEvents 1.0 specification structure.
type CloudEvent struct {
	SpecVersion     string      `json:"specversion"`
	Type            string      `json:"type"`
	Source          string      `json:"source"`
	ID              string      `json:"id"`
	Subject         string      `json:"subject,omitempty"` // scan_id for orchestration (ADR-007)
	Time            string      `json:"time"`
	DataContentType string      `json:"datacontenttype"`
	Data            interface{} `json:"data"`
}

// ServerDiscoveredData represents data for a discovered server event.
type ServerDiscoveredData struct {
	ServerID    string   `json:"server_id"`
	Hostname    string   `json:"hostname,omitempty"`
	IPAddresses []string `json:"ip_addresses"`
	OpenPorts   []int    `json:"open_ports"`
	OS          *OSInfo  `json:"os,omitempty"`
}

// ServiceDiscoveredData represents data for a discovered service event.
type ServiceDiscoveredData struct {
	ServiceID string                 `json:"service_id"`
	ServerID  string                 `json:"server_id"`
	IP        string                 `json:"ip"`
	Port      int                    `json:"port"`
	Protocol  string                 `json:"protocol"`
	Service   string                 `json:"service,omitempty"`
	Version   string                 `json:"version,omitempty"`
	Banner    string                 `json:"banner,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"` // ADR-007: candidate flags
}

// Database ports for candidate identification (ADR-007)
var databasePorts = map[int]string{
	3306:  "mysql",
	5432:  "postgresql",
	27017: "mongodb",
	6379:  "redis",
	1433:  "mssql",
	1521:  "oracle",
	9200:  "elasticsearch",
	5984:  "couchdb",
}

// OSInfo contains operating system information.
type OSInfo struct {
	Name    string `json:"name,omitempty"`
	Version string `json:"version,omitempty"`
	Family  string `json:"family,omitempty"`
}

// New creates a new Publisher connected to RabbitMQ.
func New(url string, logger *zap.SugaredLogger) (*Publisher, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	channel, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("failed to open channel: %w", err)
	}

	return &Publisher{
		conn:     conn,
		channel:  channel,
		exchange: "discovery.events",
		logger:   logger,
	}, nil
}

// Close closes the RabbitMQ connection.
func (p *Publisher) Close() error {
	if p.channel != nil {
		_ = p.channel.Close()
	}
	if p.conn != nil {
		return p.conn.Close()
	}
	return nil
}

// SetScanID sets the current scan ID for CloudEvent subject (ADR-007).
func (p *Publisher) SetScanID(scanID string) {
	p.scanID = scanID
}

// GetScanID returns the current scan ID.
func (p *Publisher) GetScanID() string {
	return p.scanID
}

// PublishServerDiscovered publishes a server discovered event.
func (p *Publisher) PublishServerDiscovered(data ServerDiscoveredData) error {
	event := p.createEvent("discovery.server.discovered", data)
	return p.publish(event, "discovered.server")
}

// PublishServiceDiscovered publishes a service discovered event.
func (p *Publisher) PublishServiceDiscovered(result interface{}) error {
	// Convert ScanResult to ServiceDiscoveredData
	var data ServiceDiscoveredData

	// Type assertion for scanner.ScanResult
	if scanResult, ok := result.(interface {
		GetIP() string
		GetPort() int
		GetProtocol() string
		GetService() string
		GetBanner() string
	}); ok {
		port := scanResult.GetPort()
		banner := scanResult.GetBanner()

		data = ServiceDiscoveredData{
			ServiceID: uuid.New().String(),
			IP:        scanResult.GetIP(),
			Port:      port,
			Protocol:  scanResult.GetProtocol(),
			Service:   scanResult.GetService(),
			Banner:    banner,
			Metadata:  buildMetadata(port, banner), // ADR-007: Add candidate flags
		}
	} else {
		// Direct struct conversion for simple cases
		jsonBytes, err := json.Marshal(result)
		if err != nil {
			return fmt.Errorf("failed to marshal result: %w", err)
		}
		if err := json.Unmarshal(jsonBytes, &data); err != nil {
			return fmt.Errorf("failed to unmarshal to ServiceDiscoveredData: %w", err)
		}
		if data.ServiceID == "" {
			data.ServiceID = uuid.New().String()
		}
		// Add metadata if not present
		if data.Metadata == nil {
			data.Metadata = buildMetadata(data.Port, data.Banner)
		}
	}

	event := p.createEvent("discovery.service.discovered", data)
	return p.publish(event, "discovered.service")
}

func (p *Publisher) createEvent(eventType string, data interface{}) CloudEvent {
	event := CloudEvent{
		SpecVersion:     "1.0",
		Type:            eventType,
		Source:          "/collectors/network-scanner",
		ID:              uuid.New().String(),
		Time:            time.Now().UTC().Format(time.RFC3339),
		DataContentType: "application/json",
		Data:            data,
	}

	// Set subject = scan_id for orchestration tracking (ADR-007)
	if p.scanID != "" {
		event.Subject = p.scanID
	}

	return event
}

// buildMetadata creates metadata with database candidate flags (ADR-007).
func buildMetadata(port int, banner string) map[string]interface{} {
	metadata := make(map[string]interface{})

	// Check if port is a known database port
	if dbType, ok := databasePorts[port]; ok {
		metadata["database_candidate"] = true
		metadata["candidate_type"] = dbType
		metadata["candidate_confidence"] = 0.5 // port_only confidence
		metadata["candidate_reason"] = fmt.Sprintf("Port %d (known %s port)", port, dbType)
	}

	return metadata
}

func (p *Publisher) publish(event CloudEvent, routingKey string) error {
	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err = p.channel.PublishWithContext(
		ctx,
		p.exchange,
		routingKey,
		false, // mandatory
		false, // immediate
		amqp.Publishing{
			ContentType: "application/cloudevents+json",
			Body:        body,
			MessageId:   event.ID,
			Timestamp:   time.Now(),
		},
	)

	if err != nil {
		return fmt.Errorf("failed to publish event: %w", err)
	}

	p.logger.Debugw("Event published",
		"type", event.Type,
		"id", event.ID,
		"routing_key", routingKey,
	)

	return nil
}
