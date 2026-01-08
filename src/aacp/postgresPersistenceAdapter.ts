import type { StructuredError } from '../errors/index.js';
import type { PostgresClient } from '../storage/postgres.js';
import type { EmbeddingProvider } from '../embeddings/types.js';
import type {
  AACPEnvelope,
  AACPRequestRecord,
  AACPMessageRecord,
} from './types.js';
import { AACPOutcome } from './types.js';
import type { AACPPersistenceAdapter } from './persistenceAdapter.js';
import { PostgresCoordinatorMemory } from '../coordinator/memory/coordinatorMemory.js';

export class PostgresAACPPersistenceAdapter implements AACPPersistenceAdapter {
  private readonly client: PostgresClient;
  private readonly memory: PostgresCoordinatorMemory | null;

  constructor(options: {
    client: PostgresClient;
    embeddings?: EmbeddingProvider;
    model?: string;
    dimensions?: number;
    maxInlineBytes?: number;
    artifactRoot?: string;
  }) {
    this.client = options.client;
    if (options.embeddings && options.model && options.dimensions && options.maxInlineBytes && options.artifactRoot) {
      this.memory = new PostgresCoordinatorMemory({
        client: options.client,
        embeddings: options.embeddings,
        model: options.model,
        dimensions: options.dimensions,
        maxInlineBytes: options.maxInlineBytes,
        artifactRoot: options.artifactRoot,
      });
    } else {
      this.memory = new PostgresCoordinatorMemory({
        client: options.client,
        maxInlineBytes: options.maxInlineBytes ?? 262144,
        artifactRoot: options.artifactRoot ?? './artifacts',
      });
    }
  }

  async putRequestRecord(requestId: string, record: AACPRequestRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO aacp_requests (request_id, correlation_id, causation_id, source_agent_id, target_agent_id, message_type, payload_json, status, timestamp, expires_at, completion_ref, error_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (request_id) DO UPDATE SET status = EXCLUDED.status, payload_json = EXCLUDED.payload_json, error_json = EXCLUDED.error_json, correlation_id = EXCLUDED.correlation_id, causation_id = EXCLUDED.causation_id`,
      [
        requestId,
        record.correlationId ?? null,
        record.causationId ?? null,
        record.sourceAgentId,
        record.targetAgentId,
        record.messageType,
        record.payload ?? null,
        record.status,
        record.timestamp,
        record.expiresAt ?? null,
        record.completionRef ?? null,
        record.error ?? null,
      ]
    );
  }

  async putMessageRecord(messageId: string, record: AACPMessageRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO aacp_messages (id, request_id, correlation_id, causation_id, source_agent_id, target_agent_id, status, created_at, expires_at, retry_count, next_retry_at, envelope_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, envelope_json = EXCLUDED.envelope_json, retry_count = EXCLUDED.retry_count, next_retry_at = EXCLUDED.next_retry_at`,
      [
        messageId,
        record.requestId ?? null,
        record.envelope.correlationId,
        record.envelope.causationId,
        record.envelope.source.id,
        record.envelope.destination.type === 'direct'
          ? record.envelope.destination.agentId
          : record.envelope.destination.type === 'reply'
          ? record.envelope.source.id
          : null,
        record.status,
        record.timestamp,
        record.expiresAt ?? null,
        record.retryCount,
        record.nextRetryAt ?? null,
        record.envelope,
      ]
    );

    if (this.memory) {
      const aacpInput = {
        id: messageId,
        sourceAgentId: record.envelope.source.id,
        targetAgentId:
          record.envelope.destination.type === 'direct'
            ? record.envelope.destination.agentId
            : record.envelope.destination.type === 'reply'
            ? record.envelope.source.id
            : 'broadcast',
        status: record.status,
        createdAt: record.timestamp,
        retryCount: record.retryCount,
        envelope: record.envelope,
      } as const;
      const mutableInput: {
        id: string;
        requestId?: string;
        correlationId?: string;
        causationId?: string;
        sourceAgentId: string;
        targetAgentId: string;
        status: string;
        createdAt: string;
        expiresAt?: string;
        retryCount: number;
        nextRetryAt?: string;
        envelope: AACPEnvelope;
      } = { ...aacpInput };
      if (record.requestId !== undefined) {
        mutableInput.requestId = record.requestId;
      }
      mutableInput.correlationId = record.envelope.correlationId;
      mutableInput.causationId = record.envelope.causationId;
      if (record.expiresAt !== undefined) {
        mutableInput.expiresAt = record.expiresAt;
      }
      if (record.nextRetryAt !== undefined) {
        mutableInput.nextRetryAt = record.nextRetryAt;
      }

      await this.memory.recordAacpEnvelope(mutableInput);
    }
  }

  async getRequestRecord(requestId: string): Promise<AACPRequestRecord | null> {
    const result = await this.client.query<AACPRequestRecord>(
      `SELECT request_id AS "requestId", correlation_id AS "correlationId", causation_id AS "causationId",
              source_agent_id AS "sourceAgentId", target_agent_id AS "targetAgentId", message_type AS "messageType",
              payload_json AS "payload", status, timestamp, expires_at AS "expiresAt",
              completion_ref AS "completionRef", error_json AS "error"
       FROM aacp_requests WHERE request_id = $1`,
      [requestId]
    );
    return result.rows[0] ?? null;
  }

  async getMessageRecord(messageId: string): Promise<AACPMessageRecord | null> {
    const result = await this.client.query<AACPMessageRecord>(
      `SELECT id AS "messageId", request_id AS "requestId", envelope_json AS "envelope", status, created_at AS "timestamp",
              expires_at AS "expiresAt", retry_count AS "retryCount", next_retry_at AS "nextRetryAt"
       FROM aacp_messages WHERE id = $1`,
      [messageId]
    );
    return result.rows[0] ?? null;
  }

  async markCompleted(requestId: string, outcome: AACPOutcome, completionRef?: string): Promise<void> {
    await this.client.query(
      `UPDATE aacp_requests SET status = $1, completion_ref = $2, timestamp = now() WHERE request_id = $3`,
      [outcome, completionRef ?? null, requestId]
    );
  }

  async markFailed(requestId: string, error: StructuredError): Promise<void> {
    await this.client.query(
      `UPDATE aacp_requests SET status = $1, error_json = $2, timestamp = now() WHERE request_id = $3`,
      [AACPOutcome.FAILED, error, requestId]
    );
  }

  async getLastSequence(sourceAgentId: string, targetAgentId: string): Promise<number> {
    const result = await this.client.query<{ seq: number }>(
      `SELECT COALESCE(MAX((envelope_json->>'seq')::int), 0) AS seq
       FROM aacp_messages
       WHERE source_agent_id = $1 AND target_agent_id = $2`,
      [sourceAgentId, targetAgentId]
    );
    return result.rows[0]?.seq ?? 0;
  }

  async updateLastSequence(_sourceAgentId: string, _targetAgentId: string, _seq: number): Promise<void> {
    return Promise.resolve();
  }

  async getUnacknowledgedMessages(sourceAgentId: string, targetAgentId: string): Promise<AACPEnvelope[]> {
    const result = await this.client.query<{ envelope: AACPEnvelope }>(
      `SELECT envelope_json AS envelope
       FROM aacp_messages
       WHERE source_agent_id = $1 AND target_agent_id = $2 AND status <> $3
       ORDER BY (envelope_json->>'seq')::int ASC`,
      [sourceAgentId, targetAgentId, AACPOutcome.COMPLETED]
    );
    return result.rows.map(row => row.envelope);
  }

  async listPendingRequests(olderThan?: Date): Promise<AACPRequestRecord[]> {
    const params: Array<unknown> = [AACPOutcome.UNKNOWN];
    let query = `SELECT request_id AS "requestId", source_agent_id AS "sourceAgentId", target_agent_id AS "targetAgentId",
                        message_type AS "messageType", payload_json AS "payload", status, timestamp, expires_at AS "expiresAt",
                        completion_ref AS "completionRef", error_json AS "error"
                 FROM aacp_requests WHERE status = $1`;
    if (olderThan) {
      params.push(olderThan.toISOString());
      query += ` AND timestamp < $2`;
    }
    const result = await this.client.query<AACPRequestRecord>(query, params);
    return result.rows;
  }

  async listMessagesInState(outcome: AACPOutcome, olderThan?: Date): Promise<AACPMessageRecord[]> {
    const params: Array<unknown> = [outcome];
    let query = `SELECT id AS "messageId", request_id AS "requestId", envelope_json AS "envelope", status,
                        created_at AS "timestamp", expires_at AS "expiresAt", retry_count AS "retryCount", next_retry_at AS "nextRetryAt"
                 FROM aacp_messages WHERE status = $1`;
    if (olderThan) {
      params.push(olderThan.toISOString());
      query += ` AND created_at < $2`;
    }
    const result = await this.client.query<AACPMessageRecord>(query, params);
    return result.rows;
  }

  async purgeExpired(now: Date): Promise<number> {
    const result = await this.client.query<{ count: number }>(
      `WITH deleted AS (
         DELETE FROM aacp_messages WHERE expires_at <= $1 RETURNING id
       )
       SELECT COUNT(*)::int AS count FROM deleted`,
      [now.toISOString()]
    );
    return result.rows[0]?.count ?? 0;
  }
}
