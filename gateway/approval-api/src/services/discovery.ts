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
  review_notes: string | null;
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
      params,
    );
    const total = parseInt(countResult[0]?.count || "0", 10);

    // Get paginated data
    const data = await db.query<Discovery>(
      `SELECT * FROM gateway.discoveries ${whereClause}
       ORDER BY ${safeSort} ${safeOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, pageSize, offset],
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
      [id],
    );
    return result[0] || null;
  }

  async approve(id: string, actor: string): Promise<Discovery | null> {
    const discovery = await this.getById(id);
    if (!discovery) return null;

    if (discovery.status !== "pending") {
      throw new Error(
        `Cannot approve discovery with status: ${discovery.status}`,
      );
    }

    await db.query(
      `UPDATE gateway.discoveries
       SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id, actor],
    );

    // Create audit entry
    await db.query(
      `INSERT INTO gateway.audit_log (id, event_type, actor_username, target_type, target_id, details, event_timestamp)
       VALUES ($1, 'discovery_approved', $2, 'discovery', $3, '{}', NOW())`,
      [uuidv4(), actor, id],
    );

    logger.info("Discovery approved", { id, actor });
    return this.getById(id);
  }

  async reject(
    id: string,
    actor: string,
    reason: string,
  ): Promise<Discovery | null> {
    const discovery = await this.getById(id);
    if (!discovery) return null;

    if (discovery.status !== "pending") {
      throw new Error(
        `Cannot reject discovery with status: ${discovery.status}`,
      );
    }

    await db.query(
      `UPDATE gateway.discoveries
       SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(),
           review_notes = $3, updated_at = NOW()
       WHERE id = $1`,
      [id, actor, reason],
    );

    // Create audit entry
    await db.query(
      `INSERT INTO gateway.audit_log (id, event_type, actor_username, target_type, target_id, details, event_timestamp)
       VALUES ($1, 'discovery_rejected', $2, 'discovery', $3, $4, NOW())`,
      [uuidv4(), actor, id, JSON.stringify({ reason })],
    );

    logger.info("Discovery rejected", { id, actor, reason });
    return this.getById(id);
  }

  async batchApprove(ids: string[], actor: string): Promise<number> {
    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      let approved = 0;
      for (const id of ids) {
        // Check discovery exists and is pending
        const result = await client.query(
          "SELECT id, status FROM gateway.discoveries WHERE id = $1",
          [id],
        );

        if (result.rows.length === 0) {
          throw new Error(`Discovery not found: ${id}`);
        }

        if (result.rows[0].status !== "pending") {
          throw new Error(
            `Cannot approve discovery ${id} with status: ${result.rows[0].status}`,
          );
        }

        // Update discovery
        await client.query(
          `UPDATE gateway.discoveries
           SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [id, actor],
        );

        // Create audit entry
        await client.query(
          `INSERT INTO gateway.audit_log (id, event_type, actor_username, target_type, target_id, details, event_timestamp)
           VALUES ($1, 'discovery_approved', $2, 'discovery', $3, '{}', NOW())`,
          [uuidv4(), actor, id],
        );

        approved++;
      }

      await client.query("COMMIT");
      logger.info("Batch approval completed", { count: approved, actor });
      return approved;
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Batch approval failed, rolled back", { error, ids, actor });
      throw error;
    } finally {
      client.release();
    }
  }
}

export const discoveryService = new DiscoveryService();
