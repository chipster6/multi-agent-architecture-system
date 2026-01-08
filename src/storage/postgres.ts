import { Pool } from 'pg';
import type { ServerConfig } from '../config/configManager.js';

export interface PostgresClient {
  query<T = unknown>(text: string, params?: Array<unknown>): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

export function createPostgresClient(config: ServerConfig): PostgresClient {
  if (!config.database) {
    throw new Error('Database configuration is missing');
  }
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
  });

  return {
    query: async <T = unknown>(text: string, params?: Array<unknown>) => {
      const result = await pool.query(text, params);
      return { rows: result.rows as T[] };
    },
    end: () => pool.end(),
  };
}

export function vectorToSqlLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
