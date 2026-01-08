import type { ArchitecturalDecision, Artifact } from '../../shared/types/index.js';
import type { EmbeddingProvider } from '../../embeddings/types.js';
import type { PostgresClient } from '../../storage/postgres.js';

export interface CoordinatorMemory {
  recordDecision(decision: ArchitecturalDecision, correlationId?: string): Promise<void>;
  recordArtifact(artifact: Artifact, decisionId?: string): Promise<void>;
  recordMessageSummary(input: MessageSummaryInput): Promise<void>;
  recordAacpEnvelope(input: AacpEnvelopeInput): Promise<void>;
  recordLogEntry(entry: LogEntryInput): Promise<void>;
  purgeOldLogs(retentionDays: number): Promise<void>;
}

export interface MessageSummaryInput {
  id: string;
  sourceAgentId: string;
  targetAgentId: string;
  messageType: string;
  correlationId?: string;
  summaryText: string;
  payload?: unknown;
}

export interface AacpEnvelopeInput {
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
  envelope: unknown;
}

export interface LogEntryInput {
  level: string;
  message: string;
  timestamp: string;
  correlationId?: string;
  context?: Record<string, unknown>;
}

export class PostgresCoordinatorMemory implements CoordinatorMemory {
  private readonly client: PostgresClient;
  private readonly embeddings: EmbeddingProvider | undefined;
  private readonly model: string | undefined;
  private readonly dimensions: number | undefined;
  private readonly maxInlineBytes: number;
  private readonly artifactRoot: string;

  constructor(options: {
    client: PostgresClient;
    embeddings?: EmbeddingProvider;
    model?: string;
    dimensions?: number;
    maxInlineBytes: number;
    artifactRoot: string;
  }) {
    this.client = options.client;
    this.embeddings = options.embeddings;
    this.model = options.model;
    this.dimensions = options.dimensions;
    this.maxInlineBytes = options.maxInlineBytes;
    this.artifactRoot = options.artifactRoot;
  }

  async recordDecision(decision: ArchitecturalDecision, correlationId?: string): Promise<void> {
    await this.client.query(
      `INSERT INTO decisions (id, agent_id, phase, domain, correlation_id, decision_json)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET decision_json = EXCLUDED.decision_json`,
      [
        decision.id,
        decision.agentId,
        decision.phase,
        decision.category,
        correlationId ?? null,
        decision,
      ]
    );

    const summary = buildDecisionSummary(decision);
    if (this.embeddings && this.model && this.dimensions) {
      await this.insertEmbedding('decision', decision.id, summary, this.model, this.dimensions);
    }
  }

  async recordArtifact(artifact: Artifact, decisionId?: string): Promise<void> {
    const contentBytes = Buffer.byteLength(artifact.content, 'utf8');
    const shouldInline = contentBytes <= this.maxInlineBytes;
    const contentJson = shouldInline ? { content: artifact.content } : null;
    const contentPath = shouldInline ? null : await this.writeArtifactToDisk(artifact);

    await this.client.query(
      `INSERT INTO artifacts (id, decision_id, type, name, format, content_json, content_path, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET content_json = EXCLUDED.content_json, content_path = EXCLUDED.content_path`,
      [
        artifact.id,
        decisionId ?? null,
        artifact.type,
        artifact.name,
        artifact.format,
        contentJson,
        contentPath,
        {
          agentId: artifact.agentId,
          phase: artifact.phase,
          timestamp: artifact.timestamp,
        },
      ]
    );

    const summary = buildArtifactSummary(artifact);
    if (this.embeddings && this.model && this.dimensions) {
      await this.insertEmbedding('artifact', artifact.id, summary, this.model, this.dimensions);
    }
  }

  async recordMessageSummary(input: MessageSummaryInput): Promise<void> {
    await this.client.query(
      `INSERT INTO message_summaries (id, source_agent_id, target_agent_id, message_type, correlation_id, summary_text, payload_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET summary_text = EXCLUDED.summary_text`,
      [
        input.id,
        input.sourceAgentId,
        input.targetAgentId,
        input.messageType,
        input.correlationId ?? null,
        input.summaryText,
        input.payload ?? null,
      ]
    );

    if (this.embeddings && this.model && this.dimensions) {
      await this.insertEmbedding('message_summary', input.id, input.summaryText, this.model, this.dimensions);
    }
  }

  async recordAacpEnvelope(input: AacpEnvelopeInput): Promise<void> {
    await this.client.query(
      `INSERT INTO aacp_messages (id, request_id, correlation_id, causation_id, source_agent_id, target_agent_id, status, created_at, expires_at, retry_count, next_retry_at, envelope_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET envelope_json = EXCLUDED.envelope_json, status = EXCLUDED.status`,
      [
        input.id,
        input.requestId ?? null,
        input.correlationId ?? null,
        input.causationId ?? null,
        input.sourceAgentId,
        input.targetAgentId,
        input.status,
        input.createdAt,
        input.expiresAt ?? null,
        input.retryCount,
        input.nextRetryAt ?? null,
        input.envelope,
      ]
    );

    const summaryText = buildAacpSummary(input);
    if (this.embeddings && this.model && this.dimensions) {
      await this.insertEmbedding('aacp_message', input.id, summaryText, this.model, this.dimensions);
    }

    const summaryInput: MessageSummaryInput = {
      id: `aacp-${input.id}`,
      sourceAgentId: input.sourceAgentId,
      targetAgentId: input.targetAgentId,
      messageType: 'AACP',
      summaryText,
      payload: input.envelope,
    };
    if (input.correlationId !== undefined) {
      summaryInput.correlationId = input.correlationId;
    }
    await this.recordMessageSummary(summaryInput);
  }

  async recordLogEntry(entry: LogEntryInput): Promise<void> {
    await this.client.query(
      `INSERT INTO log_entries (level, message, timestamp, correlation_id, context_json)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        entry.level,
        entry.message,
        entry.timestamp,
        entry.correlationId ?? null,
        entry.context ?? null,
      ]
    );
  }

  async purgeOldLogs(retentionDays: number): Promise<void> {
    await this.client.query(
      `DELETE FROM log_entries WHERE timestamp < now() - ($1::text || ' days')::interval`,
      [retentionDays]
    );
  }

  private async insertEmbedding(
    entityType: string,
    entityId: string,
    text: string,
    model: string,
    dimensions: number
  ): Promise<void> {
    const truncated = truncateText(text, 8000);
    if (!this.embeddings) {
      return;
    }
    const vector = await this.embeddings.embedText(truncated);

    await this.client.query(
      `INSERT INTO embeddings (entity_type, entity_id, model, dimensions, embedding)
       VALUES ($1, $2, $3, $4, $5::vector(${dimensions}))`,
      [entityType, entityId, model, dimensions, `[${vector.join(',')}]`]
    );
  }

  private async writeArtifactToDisk(artifact: Artifact): Promise<string> {
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const baseDir = this.artifactRoot;
    await fs.mkdir(baseDir, { recursive: true });

    const safeName = artifact.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${artifact.id}-${safeName}.${artifact.format}`;
    const fullPath = path.join(baseDir, filename);
    await fs.writeFile(fullPath, artifact.content, 'utf8');
    return fullPath;
  }
}

function buildDecisionSummary(decision: ArchitecturalDecision): string {
  const alternatives = decision.alternatives.length ? ` Alternatives: ${decision.alternatives.join('; ')}` : '';
  const consequences = decision.consequences.length ? ` Consequences: ${decision.consequences.join('; ')}` : '';
  return `Decision ${decision.id} by ${decision.agentId} (${decision.category}). ${decision.decision}. Rationale: ${decision.rationale}.${alternatives}${consequences}`;
}

function buildArtifactSummary(artifact: Artifact): string {
  return `Artifact ${artifact.id} (${artifact.type}) "${artifact.name}" format=${artifact.format} from ${artifact.agentId}.`;
}

function buildAacpSummary(input: AacpEnvelopeInput): string {
  return `AACP ${input.id} ${input.sourceAgentId} -> ${input.targetAgentId} status=${input.status} correlation=${input.correlationId ?? 'none'} request=${input.requestId ?? 'none'}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}
