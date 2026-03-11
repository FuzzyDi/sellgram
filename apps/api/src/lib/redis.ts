import Redis from 'ioredis';
import { getConfig } from '../config/index.js';

let redis: Redis;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(getConfig().REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return redis;
}

export default getRedis;
