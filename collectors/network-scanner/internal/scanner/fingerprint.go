// Package scanner implements service fingerprinting functionality.
package scanner

import (
	"regexp"
	"strings"
)

// ServiceFingerprint contains fingerprint information for a service.
type ServiceFingerprint struct {
	Name    string
	Version string
	Product string
	Info    string
}

// Fingerprinter identifies services from banners and port numbers.
type Fingerprinter struct {
	signatures []signature
}

type signature struct {
	pattern *regexp.Regexp
	service string
	extract func([]string) ServiceFingerprint
}

// NewFingerprinter creates a new service fingerprinter.
func NewFingerprinter() *Fingerprinter {
	f := &Fingerprinter{}
	f.loadSignatures()
	return f
}

// Identify attempts to identify a service from port and banner.
func (f *Fingerprinter) Identify(port int, banner string) ServiceFingerprint {
	// First try banner-based identification
	if banner != "" {
		for _, sig := range f.signatures {
			if matches := sig.pattern.FindStringSubmatch(banner); matches != nil {
				return sig.extract(matches)
			}
		}
	}

	// Fall back to port-based identification
	return f.identifyByPort(port)
}

func (f *Fingerprinter) loadSignatures() {
	f.signatures = []signature{
		// SSH
		{
			pattern: regexp.MustCompile(`SSH-(\d+\.\d+)-(\S+)`),
			service: "ssh",
			extract: func(m []string) ServiceFingerprint {
				return ServiceFingerprint{
					Name:    "SSH",
					Version: m[1],
					Product: m[2],
				}
			},
		},
		// HTTP/HTTPS servers
		{
			pattern: regexp.MustCompile(`(?i)HTTP/(\d+\.\d+)\s+\d+`),
			service: "http",
			extract: func(m []string) ServiceFingerprint {
				return ServiceFingerprint{
					Name:    "HTTP",
					Version: m[1],
				}
			},
		},
		// Apache
		{
			pattern: regexp.MustCompile(`(?i)Apache[/ ](\d+\.\d+(?:\.\d+)?)`),
			service: "http",
			extract: func(m []string) ServiceFingerprint {
				return ServiceFingerprint{
					Name:    "HTTP",
					Version: m[1],
					Product: "Apache",
				}
			},
		},
		// nginx
		{
			pattern: regexp.MustCompile(`(?i)nginx[/ ](\d+\.\d+(?:\.\d+)?)`),
			service: "http",
			extract: func(m []string) ServiceFingerprint {
				return ServiceFingerprint{
					Name:    "HTTP",
					Version: m[1],
					Product: "nginx",
				}
			},
		},
		// MySQL
		{
			pattern: regexp.MustCompile(`(\d+\.\d+\.\d+).*MySQL`),
			service: "mysql",
			extract: func(m []string) ServiceFingerprint {
				return ServiceFingerprint{
					Name:    "MySQL",
					Version: m[1],
					Product: "MySQL",
				}
			},
		},
		// PostgreSQL
		{
			pattern: regexp.MustCompile(`PostgreSQL (\d+\.\d+)`),
			service: "postgresql",
			extract: func(m []string) ServiceFingerprint {
				return ServiceFingerprint{
					Name:    "PostgreSQL",
					Version: m[1],
					Product: "PostgreSQL",
				}
			},
		},
		// Redis
		{
			pattern: regexp.MustCompile(`-ERR.*redis|REDIS`),
			service: "redis",
			extract: func(m []string) ServiceFingerprint {
				return ServiceFingerprint{
					Name:    "Redis",
					Product: "Redis",
				}
			},
		},
		// MongoDB
		{
			pattern: regexp.MustCompile(`MongoDB|mongod`),
			service: "mongodb",
			extract: func(m []string) ServiceFingerprint {
				return ServiceFingerprint{
					Name:    "MongoDB",
					Product: "MongoDB",
				}
			},
		},
		// RabbitMQ
		{
			pattern: regexp.MustCompile(`AMQP|RabbitMQ`),
			service: "amqp",
			extract: func(m []string) ServiceFingerprint {
				return ServiceFingerprint{
					Name:    "AMQP",
					Product: "RabbitMQ",
				}
			},
		},
		// FTP
		{
			pattern: regexp.MustCompile(`(?i)^220[- ].*FTP`),
			service: "ftp",
			extract: func(m []string) ServiceFingerprint {
				return ServiceFingerprint{
					Name: "FTP",
				}
			},
		},
		// SMTP
		{
			pattern: regexp.MustCompile(`(?i)^220[- ].*SMTP|ESMTP`),
			service: "smtp",
			extract: func(m []string) ServiceFingerprint {
				return ServiceFingerprint{
					Name: "SMTP",
				}
			},
		},
	}
}

func (f *Fingerprinter) identifyByPort(port int) ServiceFingerprint {
	// Well-known port mappings
	portServices := map[int]ServiceFingerprint{
		21:    {Name: "FTP"},
		22:    {Name: "SSH"},
		23:    {Name: "Telnet"},
		25:    {Name: "SMTP"},
		53:    {Name: "DNS"},
		80:    {Name: "HTTP"},
		110:   {Name: "POP3"},
		143:   {Name: "IMAP"},
		443:   {Name: "HTTPS"},
		445:   {Name: "SMB"},
		465:   {Name: "SMTPS"},
		587:   {Name: "SMTP Submission"},
		993:   {Name: "IMAPS"},
		995:   {Name: "POP3S"},
		1433:  {Name: "MSSQL"},
		1521:  {Name: "Oracle"},
		3306:  {Name: "MySQL"},
		3389:  {Name: "RDP"},
		5432:  {Name: "PostgreSQL"},
		5672:  {Name: "AMQP", Product: "RabbitMQ"},
		6379:  {Name: "Redis"},
		8080:  {Name: "HTTP-Alt"},
		8443:  {Name: "HTTPS-Alt"},
		9200:  {Name: "Elasticsearch"},
		9300:  {Name: "Elasticsearch-Transport"},
		15672: {Name: "RabbitMQ-Management"},
		27017: {Name: "MongoDB"},
	}

	if fp, ok := portServices[port]; ok {
		return fp
	}

	return ServiceFingerprint{Name: "Unknown"}
}

// IdentifyOS attempts to identify the OS from various clues.
func IdentifyOS(banners map[int]string) string {
	for _, banner := range banners {
		bannerLower := strings.ToLower(banner)

		// Windows indicators
		if strings.Contains(bannerLower, "windows") ||
			strings.Contains(bannerLower, "microsoft") ||
			strings.Contains(bannerLower, "iis") {
			return "Windows"
		}

		// Linux indicators
		if strings.Contains(bannerLower, "ubuntu") ||
			strings.Contains(bannerLower, "debian") ||
			strings.Contains(bannerLower, "centos") ||
			strings.Contains(bannerLower, "rhel") ||
			strings.Contains(bannerLower, "fedora") ||
			strings.Contains(bannerLower, "linux") {
			return "Linux"
		}

		// macOS indicators
		if strings.Contains(bannerLower, "darwin") ||
			strings.Contains(bannerLower, "macos") {
			return "macOS"
		}

		// FreeBSD
		if strings.Contains(bannerLower, "freebsd") {
			return "FreeBSD"
		}
	}

	return "Unknown"
}
