import amqplib, { Channel, ChannelModel } from "amqplib";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config";
import { logger } from "./logger";
import { db } from "./database";

interface CloudEvent {
  specversion: string;
  type: string;
  source: string;
  id: string;
  time: string;
  subject?: string; // scan_id for orchestration tracking (ADR-007)
  data: Record<string, unknown>;
}

class Consumer {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private stopping = false;

  isConnected(): boolean {
    return this.connected;
  }

  async start(): Promise<void> {
    try {
      this.connection = await amqplib.connect(config.rabbitmq.url);
      this.channel = await this.connection.createChannel();

      // Setup queue
      await this.channel!.assertQueue(config.rabbitmq.queue, {
        durable: true,
      });

      // Bind to scored.* events
      await this.channel!.bindQueue(
        config.rabbitmq.queue,
        config.rabbitmq.exchange,
        "scored.*",
      );

      // Start consuming
      await this.channel!.consume(
        config.rabbitmq.queue,
        async (msg) => {
          if (!msg) return;

          try {
            const event: CloudEvent = JSON.parse(msg.content.toString());
            await this.handleEvent(event);
            this.channel?.ack(msg);
          } catch (error) {
            logger.error("Failed to process message", { error });
            // Nack and requeue on failure
            this.channel?.nack(msg, false, true);
          }
        },
        { noAck: false },
      );

      this.connected = true;
      this.reconnectAttempts = 0;
      logger.info("RabbitMQ consumer connected and listening");

      // Handle connection close
      this.connection!.on("close", () => {
        if (this.stopping) return;
        this.connected = false;
        logger.warn("RabbitMQ connection closed, attempting reconnect...");
        this.scheduleReconnect();
      });
    } catch (error) {
      logger.error("Failed to connect to RabbitMQ", { error });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopping) return;
    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      logger.error(
        `RabbitMQ reconnection failed after ${this.maxReconnectAttempts} attempts, giving up`,
      );
      return;
    }
    const delay = Math.min(
      5000 * Math.pow(1.5, this.reconnectAttempts - 1),
      60000,
    );
    logger.info(
      `RabbitMQ reconnect attempt ${this.reconnectAttempts}/${
        this.maxReconnectAttempts
      } in ${Math.round(delay / 1000)}s`,
    );
    setTimeout(() => this.start(), delay);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
    this.connected = false;
  }

  private async handleEvent(event: CloudEvent): Promise<void> {
    logger.debug("Received event", { type: event.type, id: event.id });

    // Check for duplicate (idempotent handling)
    const existing = await db.query<{ id: string }>(
      "SELECT id FROM gateway.discoveries WHERE id = $1",
      [event.id],
    );

    if (existing.length > 0) {
      logger.debug("Duplicate event, skipping", { id: event.id });
      return;
    }

    // Extract source service from event source
    const sourceService = event.source.split("/").pop() || "unknown";

    // Store discovery with optional scan_id from CloudEvent subject (ADR-007)
    await db.query(
      `INSERT INTO gateway.discoveries (id, event_type, source_service, payload, scan_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())`,
      [
        event.id,
        event.type,
        sourceService,
        JSON.stringify(event.data),
        event.subject || null,
      ],
    );

    // Create audit entry (best-effort — don't let audit failure cause message requeue)
    try {
      await db.query(
        `INSERT INTO gateway.audit_log (id, event_type, target_type, target_id, details, event_timestamp)
         VALUES ($1, 'discovery_received', 'discovery', $2, $3, NOW())`,
        [
          uuidv4(),
          event.id,
          JSON.stringify({ event_type: event.type, source: event.source }),
        ],
      );
    } catch (auditErr) {
      logger.error("Failed to write audit log for discovery", {
        error: auditErr,
        discoveryId: event.id,
      });
    }

    logger.info("Discovery stored", { id: event.id, type: event.type });
  }
}

export const consumer = new Consumer();
