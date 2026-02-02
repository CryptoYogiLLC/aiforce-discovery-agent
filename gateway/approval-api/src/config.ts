import dotenv from "dotenv";

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || "3001", 10),
    host: process.env.HOST || "0.0.0.0",
  },
  database: {
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
    user: process.env.POSTGRES_USER || "discovery",
    password: process.env.POSTGRES_PASSWORD || "discovery",
    database: process.env.POSTGRES_DB || "discovery",
    ssl: process.env.POSTGRES_SSL === "true",
    poolSize: parseInt(process.env.POSTGRES_POOL_SIZE || "10", 10),
  },
  rabbitmq: {
    url:
      process.env.RABBITMQ_URL ||
      "amqp://discovery:discovery@localhost:5672/",
    exchange: process.env.RABBITMQ_EXCHANGE || "discovery.events",
    queue: process.env.RABBITMQ_QUEUE || "gateway.discoveries",
  },
  logging: {
    level: process.env.LOG_LEVEL || "info",
  },
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  },
};
