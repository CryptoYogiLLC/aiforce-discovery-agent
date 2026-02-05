/**
 * Scan Run orchestration service
 * Reference: ADR-007 Discovery Acquisition Model, GitHub Issue #108
 *
 * Barrel re-export: preserves all existing import paths.
 */

export {
  getScanById,
  getScanSummary,
  listScans,
  getScanDiscoveries,
  getScanCollectors,
  hasActiveScan,
} from "./scan/queries";

export {
  createScan,
  startScan,
  stopScan,
  skipInspection,
  triggerInspection,
} from "./scan/lifecycle";

export {
  handleCollectorProgress,
  handleCollectorComplete,
  updateScanDiscoveryCount,
  updatePhaseDiscoveryCount,
  checkScanCompletion,
  detectStuckScans,
} from "./scan/callbacks";
