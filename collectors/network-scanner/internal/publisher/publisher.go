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
}

// CloudEvent represents the CloudEvents 1.0 specification structure.
type CloudEvent struct {
	SpecVersion     string      `json:"specversion"`
	Type            string      `json:"type"`
	Source          string      `json:"source"`
	ID              string      `json:"id"`
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
	ServiceID string `json:"service_id"`
	ServerID  string `json:"server_id"`
	IP        string `json:"ip"`
	Port      int    `json:"port"`
	Protocol  string `json:"protocol"`
	Service   string `json:"service,omitempty"`
	Version   string `json:"version,omitempty"`
	Banner    string `json:"banner,omitempty"`
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
		data = ServiceDiscoveredData{
			ServiceID: uuid.New().String(),
			IP:        scanResult.GetIP(),
			Port:      scanResult.GetPort(),
			Protocol:  scanResult.GetProtocol(),
			Service:   scanResult.GetService(),
			Banner:    scanResult.GetBanner(),
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
	}

	event := p.createEvent("discovery.service.discovered", data)
	return p.publish(event, "discovered.service")
}

func (p *Publisher) createEvent(eventType string, data interface{}) CloudEvent {
	return CloudEvent{
		SpecVersion:     "1.0",
		Type:            eventType,
		Source:          "/collectors/network-scanner",
		ID:              uuid.New().String(),
		Time:            time.Now().UTC().Format(time.RFC3339),
		DataContentType: "application/json",
		Data:            data,
	}
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
