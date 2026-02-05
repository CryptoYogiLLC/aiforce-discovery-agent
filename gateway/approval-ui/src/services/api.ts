import { discoveries, audit } from "./api/discoveries";
import { dryrun } from "./api/dryrun";
import { profiles } from "./api/profiles";
import { users } from "./api/users";
import { scans } from "./api/scans";
import { dashboard } from "./api/dashboard";
import { auditTrail, logs } from "./api/auditTrail";

export type { ListParams } from "./api/utils";

export const api = {
  discoveries,
  audit,
  dryrun,
  profiles,
  users,
  scans,
  dashboard,
  auditTrail,
  logs,
};
