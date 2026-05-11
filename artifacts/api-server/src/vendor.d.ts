declare module "ioredis" {
  interface RedisOptions {
    enableOfflineQueue?: boolean;
    maxRetriesPerRequest?: number | null;
    retryStrategy?: (times: number) => number;
    lazyConnect?: boolean;
  }
  class Redis {
    constructor(url: string, options?: RedisOptions);
    on(event: string, cb: (...args: any[]) => void): this;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: any[]): Promise<string>;
    del(...keys: string[]): Promise<number>;
    publish(channel: string, message: string): Promise<number>;
    subscribe(channel: string): Promise<number>;
    disconnect(): void;
    quit(): Promise<string>;
    status: string;
  }
  export default Redis;
}

declare module "rate-limit-redis" {
  import type { Store } from "express-rate-limit";
  interface RedisStoreOptions {
    sendCommand: (...args: any[]) => any;
    prefix?: string;
  }
  export class RedisStore implements Store {
    constructor(options: RedisStoreOptions);
    init(options: any): void;
    increment(key: string): Promise<{ totalHits: number; resetTime: Date }>;
    decrement(key: string): Promise<void>;
    resetKey(key: string): Promise<void>;
  }
  export default RedisStore;
}
