/**
 * Configuration Profile model and types
 * Reference: ADR-005 Configuration Propagation Model, GitHub Issue #56
 */

export type ProfileType = "preset" | "custom";

export interface PortRanges {
  tcp: string;
  udp: string;
}

export interface AdvancedSettings {
  verbose?: boolean;
  skip_fingerprinting?: boolean;
  deep_inspection?: boolean;
  offline_mode?: boolean;
  max_concurrent_hosts?: number;
  dead_host_threshold?: number;
  [key: string]: unknown;
}

export interface ConfigProfile {
  id: string;
  name: string;
  description: string | null;
  profile_type: ProfileType;

  // Network settings
  target_subnets: string[];
  port_ranges: PortRanges;
  scan_rate_limit: number;

  // Discovery limits
  max_services: number;
  max_hosts: number;
  timeout_seconds: number;

  // Resource constraints
  disk_space_limit_mb: number;
  memory_limit_mb: number;

  // Collector selection
  enabled_collectors: string[];

  // Advanced settings
  advanced_settings: AdvancedSettings;

  // Metadata
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProfileInput {
  name: string;
  description?: string;
  target_subnets?: string[];
  port_ranges?: PortRanges;
  scan_rate_limit?: number;
  max_services?: number;
  max_hosts?: number;
  timeout_seconds?: number;
  disk_space_limit_mb?: number;
  memory_limit_mb?: number;
  enabled_collectors?: string[];
  advanced_settings?: AdvancedSettings;
}

export interface UpdateProfileInput {
  name?: string;
  description?: string;
  target_subnets?: string[];
  port_ranges?: PortRanges;
  scan_rate_limit?: number;
  max_services?: number;
  max_hosts?: number;
  timeout_seconds?: number;
  disk_space_limit_mb?: number;
  memory_limit_mb?: number;
  enabled_collectors?: string[];
  advanced_settings?: AdvancedSettings;
}

export interface ScanConfig {
  id: string;
  scan_id: string;
  profile_id: string | null;
  config_snapshot: ConfigProfile;
  started_by: string | null;
  created_at: Date;
}

// Validation limits
export const PROFILE_LIMITS = {
  NAME_MAX_LENGTH: 100,
  DESCRIPTION_MAX_LENGTH: 500,
  MAX_SUBNETS: 20,
  SCAN_RATE_MIN: 1,
  SCAN_RATE_MAX: 10000,
  MAX_SERVICES_MIN: 1,
  MAX_SERVICES_MAX: 100000,
  MAX_HOSTS_MIN: 1,
  MAX_HOSTS_MAX: 50000,
  TIMEOUT_MIN: 1,
  TIMEOUT_MAX: 300,
  DISK_SPACE_MIN_MB: 100,
  DISK_SPACE_MAX_MB: 102400,
  MEMORY_MIN_MB: 128,
  MEMORY_MAX_MB: 8192,
};

// Valid collector names
export const VALID_COLLECTORS = [
  "network-scanner",
  "code-analyzer",
  "db-inspector",
];

// Convert database row to ConfigProfile
export function rowToProfile(row: Record<string, unknown>): ConfigProfile {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | null,
    profile_type: row.profile_type as ProfileType,
    target_subnets: row.target_subnets as string[],
    port_ranges: row.port_ranges as PortRanges,
    scan_rate_limit: row.scan_rate_limit as number,
    max_services: row.max_services as number,
    max_hosts: row.max_hosts as number,
    timeout_seconds: row.timeout_seconds as number,
    disk_space_limit_mb: row.disk_space_limit_mb as number,
    memory_limit_mb: row.memory_limit_mb as number,
    enabled_collectors: row.enabled_collectors as string[],
    advanced_settings: row.advanced_settings as AdvancedSettings,
    created_by: row.created_by as string | null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

// Convert database row to ScanConfig
export function rowToScanConfig(row: Record<string, unknown>): ScanConfig {
  return {
    id: row.id as string,
    scan_id: row.scan_id as string,
    profile_id: row.profile_id as string | null,
    config_snapshot: row.config_snapshot as ConfigProfile,
    started_by: row.started_by as string | null,
    created_at: new Date(row.created_at as string),
  };
}

// Validation helpers
export interface ValidationError {
  field: string;
  message: string;
}

const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
const PORT_RANGE_REGEX = /^(\d+(-\d+)?)(,\d+(-\d+)?)*$/;

export function validateSubnet(subnet: string): boolean {
  if (!CIDR_REGEX.test(subnet)) {
    return false;
  }

  const [ip, prefixStr] = subnet.split("/");
  const prefix = parseInt(prefixStr, 10);

  if (prefix < 8 || prefix > 32) {
    return false; // Prevent overly broad scans
  }

  const parts = ip.split(".");
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (num < 0 || num > 255) {
      return false;
    }
  }

  return true;
}

export function validatePortRange(range: string): boolean {
  if (!PORT_RANGE_REGEX.test(range)) {
    return false;
  }

  const parts = range.split(",");
  for (const part of parts) {
    const ports = part.split("-").map((p) => parseInt(p, 10));
    for (const port of ports) {
      if (port < 1 || port > 65535) {
        return false;
      }
    }
    if (ports.length === 2 && ports[0] > ports[1]) {
      return false; // Invalid range
    }
  }

  return true;
}

export function validateProfile(
  input: CreateProfileInput | UpdateProfileInput,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Name validation
  if ("name" in input && input.name !== undefined) {
    if (input.name.length === 0) {
      errors.push({ field: "name", message: "Name is required" });
    } else if (input.name.length > PROFILE_LIMITS.NAME_MAX_LENGTH) {
      errors.push({
        field: "name",
        message: `Name must be at most ${PROFILE_LIMITS.NAME_MAX_LENGTH} characters`,
      });
    }
  }

  // Description validation
  if (
    input.description &&
    input.description.length > PROFILE_LIMITS.DESCRIPTION_MAX_LENGTH
  ) {
    errors.push({
      field: "description",
      message: `Description must be at most ${PROFILE_LIMITS.DESCRIPTION_MAX_LENGTH} characters`,
    });
  }

  // Subnet validation
  if (input.target_subnets) {
    if (input.target_subnets.length > PROFILE_LIMITS.MAX_SUBNETS) {
      errors.push({
        field: "target_subnets",
        message: `Maximum ${PROFILE_LIMITS.MAX_SUBNETS} subnets allowed`,
      });
    }
    for (const subnet of input.target_subnets) {
      if (!validateSubnet(subnet)) {
        errors.push({
          field: "target_subnets",
          message: `Invalid subnet: ${subnet}`,
        });
      }
    }
  }

  // Port ranges validation
  if (input.port_ranges) {
    if (input.port_ranges.tcp && !validatePortRange(input.port_ranges.tcp)) {
      errors.push({
        field: "port_ranges.tcp",
        message: "Invalid TCP port range format",
      });
    }
    if (input.port_ranges.udp && !validatePortRange(input.port_ranges.udp)) {
      errors.push({
        field: "port_ranges.udp",
        message: "Invalid UDP port range format",
      });
    }
  }

  // Numeric range validations
  if (input.scan_rate_limit !== undefined) {
    if (
      input.scan_rate_limit < PROFILE_LIMITS.SCAN_RATE_MIN ||
      input.scan_rate_limit > PROFILE_LIMITS.SCAN_RATE_MAX
    ) {
      errors.push({
        field: "scan_rate_limit",
        message: `Scan rate must be between ${PROFILE_LIMITS.SCAN_RATE_MIN} and ${PROFILE_LIMITS.SCAN_RATE_MAX}`,
      });
    }
  }

  if (input.max_services !== undefined) {
    if (
      input.max_services < PROFILE_LIMITS.MAX_SERVICES_MIN ||
      input.max_services > PROFILE_LIMITS.MAX_SERVICES_MAX
    ) {
      errors.push({
        field: "max_services",
        message: `Max services must be between ${PROFILE_LIMITS.MAX_SERVICES_MIN} and ${PROFILE_LIMITS.MAX_SERVICES_MAX}`,
      });
    }
  }

  if (input.max_hosts !== undefined) {
    if (
      input.max_hosts < PROFILE_LIMITS.MAX_HOSTS_MIN ||
      input.max_hosts > PROFILE_LIMITS.MAX_HOSTS_MAX
    ) {
      errors.push({
        field: "max_hosts",
        message: `Max hosts must be between ${PROFILE_LIMITS.MAX_HOSTS_MIN} and ${PROFILE_LIMITS.MAX_HOSTS_MAX}`,
      });
    }
  }

  if (input.timeout_seconds !== undefined) {
    if (
      input.timeout_seconds < PROFILE_LIMITS.TIMEOUT_MIN ||
      input.timeout_seconds > PROFILE_LIMITS.TIMEOUT_MAX
    ) {
      errors.push({
        field: "timeout_seconds",
        message: `Timeout must be between ${PROFILE_LIMITS.TIMEOUT_MIN} and ${PROFILE_LIMITS.TIMEOUT_MAX} seconds`,
      });
    }
  }

  if (input.disk_space_limit_mb !== undefined) {
    if (
      input.disk_space_limit_mb < PROFILE_LIMITS.DISK_SPACE_MIN_MB ||
      input.disk_space_limit_mb > PROFILE_LIMITS.DISK_SPACE_MAX_MB
    ) {
      errors.push({
        field: "disk_space_limit_mb",
        message: `Disk space limit must be between ${PROFILE_LIMITS.DISK_SPACE_MIN_MB} and ${PROFILE_LIMITS.DISK_SPACE_MAX_MB} MB`,
      });
    }
  }

  if (input.memory_limit_mb !== undefined) {
    if (
      input.memory_limit_mb < PROFILE_LIMITS.MEMORY_MIN_MB ||
      input.memory_limit_mb > PROFILE_LIMITS.MEMORY_MAX_MB
    ) {
      errors.push({
        field: "memory_limit_mb",
        message: `Memory limit must be between ${PROFILE_LIMITS.MEMORY_MIN_MB} and ${PROFILE_LIMITS.MEMORY_MAX_MB} MB`,
      });
    }
  }

  // Collector validation
  if (input.enabled_collectors) {
    for (const collector of input.enabled_collectors) {
      if (!VALID_COLLECTORS.includes(collector)) {
        errors.push({
          field: "enabled_collectors",
          message: `Invalid collector: ${collector}`,
        });
      }
    }
  }

  return errors;
}

// Cross-field validation for safety checks
export function validateCrossField(
  input: CreateProfileInput | UpdateProfileInput,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // High rate + large subnet is dangerous
  if (input.target_subnets && input.scan_rate_limit) {
    const hasLargeSubnet = input.target_subnets.some((subnet) => {
      const prefix = parseInt(subnet.split("/")[1], 10);
      return prefix < 16;
    });

    if (hasLargeSubnet && input.scan_rate_limit > 500) {
      errors.push({
        field: "scan_rate_limit",
        message:
          "High scan rate with large subnet may cause network issues. Consider reducing rate limit.",
      });
    }
  }

  // Timeout vs max_hosts sanity check
  if (input.timeout_seconds && input.max_hosts) {
    const estimatedTimeMinutes = (input.max_hosts * input.timeout_seconds) / 60;
    if (estimatedTimeMinutes > 480) {
      // 8 hours
      errors.push({
        field: "timeout_seconds",
        message: `Configuration may result in very long scan times (${Math.round(
          estimatedTimeMinutes / 60,
        )} hours). Consider reducing timeout or max hosts.`,
      });
    }
  }

  return errors;
}
