import type { ConnectionOptions } from "bullmq";

export function getRedisUrl(): string {
  return process.env.REDIS_URL?.trim() || "redis://127.0.0.1:6379";
}

export function createRedisConnection(): ConnectionOptions {
  return {
    url: getRedisUrl(),
    maxRetriesPerRequest: null,
  };
}
