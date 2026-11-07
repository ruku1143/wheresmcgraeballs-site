/// <reference types="@cloudflare/vitest-pool-workers/types" />
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    TURNSTILE_SECRET: string;
    ADMIN_TOKEN: string;
    IP_HASH_SALT: string;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
