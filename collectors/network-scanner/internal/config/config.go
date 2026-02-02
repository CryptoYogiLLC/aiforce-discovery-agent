// Package config handles configuration loading from YAML files and environment variables.
package config

import (
	"strings"

	"github.com/spf13/viper"
)

// Config holds all configuration for the network scanner.
type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Scanner  ScannerConfig  `mapstructure:"scanner"`
	RabbitMQ RabbitMQConfig `mapstructure:"rabbitmq"`
	Logging  LoggingConfig  `mapstructure:"logging"`
}

// ServerConfig holds HTTP server configuration.
type ServerConfig struct {
	Port         int    `mapstructure:"port"`
	ReadTimeout  int    `mapstructure:"read_timeout"`
	WriteTimeout int    `mapstructure:"write_timeout"`
}

// ScannerConfig holds scanner-specific configuration.
type ScannerConfig struct {
	Subnets        []string `mapstructure:"subnets"`
	ExcludeSubnets []string `mapstructure:"exclude_subnets"`
	PortRanges     []string `mapstructure:"port_ranges"`
	CommonPorts    []int    `mapstructure:"common_ports"`
	RateLimit      int      `mapstructure:"rate_limit"`
	Timeout        int      `mapstructure:"timeout"`
	Concurrency    int      `mapstructure:"concurrency"`
	EnableUDP      bool     `mapstructure:"enable_udp"`
}

// RabbitMQConfig holds RabbitMQ connection configuration.
type RabbitMQConfig struct {
	URL      string `mapstructure:"url"`
	Exchange string `mapstructure:"exchange"`
}

// LoggingConfig holds logging configuration.
type LoggingConfig struct {
	Level  string `mapstructure:"level"`
	Format string `mapstructure:"format"`
}

// Load reads configuration from files and environment variables.
func Load() (*Config, error) {
	v := viper.New()

	// Set defaults
	setDefaults(v)

	// Configuration file settings
	v.SetConfigName("config")
	v.SetConfigType("yaml")
	v.AddConfigPath("/etc/network-scanner/")
	v.AddConfigPath(".")
	v.AddConfigPath("./config")

	// Read config file (optional)
	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, err
		}
		// Config file not found; use defaults and env vars
	}

	// Environment variable settings
	v.SetEnvPrefix("SCANNER")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	// Special handling for RABBITMQ_URL environment variable
	if url := viper.GetString("RABBITMQ_URL"); url != "" {
		v.Set("rabbitmq.url", url)
	}

	// Unmarshal configuration
	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func setDefaults(v *viper.Viper) {
	// Server defaults
	v.SetDefault("server.port", 8001)
	v.SetDefault("server.read_timeout", 10)
	v.SetDefault("server.write_timeout", 30)

	// Scanner defaults
	v.SetDefault("scanner.subnets", []string{})
	v.SetDefault("scanner.exclude_subnets", []string{})
	v.SetDefault("scanner.port_ranges", []string{})
	v.SetDefault("scanner.common_ports", []int{
		22, 80, 443, 3306, 5432, 6379, 8080, 8443, 27017,
	})
	v.SetDefault("scanner.rate_limit", 100)
	v.SetDefault("scanner.timeout", 2000)
	v.SetDefault("scanner.concurrency", 100)
	v.SetDefault("scanner.enable_udp", false)

	// RabbitMQ defaults
	v.SetDefault("rabbitmq.url", "amqp://discovery:discovery@localhost:5672/")
	v.SetDefault("rabbitmq.exchange", "discovery.events")

	// Logging defaults
	v.SetDefault("logging.level", "info")
	v.SetDefault("logging.format", "json")
}
