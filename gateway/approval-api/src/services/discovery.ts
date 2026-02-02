import { v4 as uuidv4 } from "uuid";
import { db } from "./database";
import { logger } from "./logger";

export interface Discovery {
  id: string;
  event_type: string;
  source_service: string;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
  status?: string;
  sourceService?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

class DiscoveryService {
  async list(options: ListOptions = {}): Promise<PaginatedResult<Discovery>> {
    const {
      page = 1,
      pageSize = 20,
      status,
      sourceService,
      sortBy = "created_at",
      sortOrder = "desc",
    } = options;

    const offset = (page - 1) * pageSize;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (sourceService) {
      conditions.push(`source_service = $${paramIndex++}`);
      params.push(sourceService);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Validate sort column to prevent SQL injection
    const validSortColumns = [
      "created_at",
      "updated_at",
      "status",
      "event_type",
      "source_service",
    ];
    const safeSort = validSortColumns.includes(sortBy) ? sortBy : "created_at";
    const safeOrder = sortOrder === "asc" ? "ASC" : "DESC";

    // Get total count
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM gateway.discoveries ${whereClause}`,
      params
    );
    const total = parseInt(countResult[0]?.count || "0", 10);

    // Get paginated data
    const data = await db.query<Discovery>(
      `SELECT * FROM gateway.discoveries ${whereClause}
       ORDER BY ${safeSort} ${safeOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, pageSize, offset]
    );

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getById(id: string): Promise<Discovery | null> {
    const result = await db.query<Discovery>(
      "SELECT * FROM gateway.discoveries WHERE id = $1",
      [id]
    );
    return result[0] || null;
  }

  async approve(id: string, actor: string): Promise<Discovery | null> {
    const discovery = await this.getById(id);
    if (!discovery) return null;

    if (discovery.status !== "pending") {
      throw new Error(`Cannot approve discovery with status: ${discovery.status}`);
    }

    await db.query(
      `UPDATE gateway.discoveries
       SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id, actor]
    );

    // Create audit entry
    await db.query(
      `INSERT INTO gateway.audit_log (id, discovery_id, action, actor, created_at)
       VALUES ($1, $2, 'approved', $3, NOW())`,
      [uuidv4(), id, actor]
    );

    logger.info("Discovery approved", { id, actor });
    return this.getById(id);
  }

  async reject(
    id: string,
    actor: string,
    reason: string
  ): Promise<Discovery | null> {
    const discovery = await this.getById(id);
    if (!discovery) return null;

    if (discovery.status !== "pending") {
      throw new Error(`Cannot reject discovery with status: ${discovery.status}`);
    }

    await db.query(
      `UPDATE gateway.discoveries
       SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(),
           rejection_reason = $3, updated_at = NOW()
       WHERE id = $1`,
      [id, actor, reason]
    );

    // Create audit entry
    await db.query(
      `INSERT INTO gateway.audit_log (id, discovery_id, action, actor, details, created_at)
       VALUES ($1, $2, 'rejected', $3, $4, NOW())`,
      [uuidv4(), id, actor, JSON.stringify({ reason })]
    );

    logger.info("Discovery rejected", { id, actor, reason });
    return this.getById(id);
  }

  async batchApprove(ids: string[], actor: string): Promise<number> {
    let approved = 0;

    for (const id of ids) {
      try {
        const result = await this.approve(id, actor);
        if (result) approved++;
      } catch (error) {
        logger.warn("Failed to approve discovery in batch", { id, error });
      }
    }

    return approved;
  }
}

export const discoveryService = new DiscoveryService();
