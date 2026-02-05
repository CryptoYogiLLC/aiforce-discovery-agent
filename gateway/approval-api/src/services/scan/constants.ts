// Internal API key for callbacks (collectors use this to auth)
export const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

// Collector service URLs (internal Docker network)
export const COLLECTOR_URLS = {
  "network-scanner":
    process.env.NETWORK_SCANNER_URL || "http://network-scanner:8001",
  "code-analyzer": process.env.CODE_ANALYZER_URL || "http://code-analyzer:8002",
  "db-inspector": process.env.DB_INSPECTOR_URL || "http://db-inspector:8003",
};

// Map collector names to ADR-007 phases
export const COLLECTOR_PHASE_MAP: Record<string, string> = {
  "network-scanner": "enumeration",
  "code-analyzer": "enumeration",
  "db-inspector": "inspection",
};

// Approval API base URL for callbacks
export const APPROVAL_API_URL =
  process.env.APPROVAL_API_URL || "http://approval-api:3001";

/**
 * Parse port ranges from config format to flat list
 */
export function parsePortRanges(
  portRanges: Record<string, string> | undefined,
): string[] {
  if (!portRanges) {
    return ["1-1024", "3306", "5432"];
  }

  const ports: string[] = [];
  if (portRanges.tcp) {
    ports.push(...portRanges.tcp.split(",").map((p) => p.trim()));
  }
  return ports;
}
