/**
 * AACP Session Manager Implementation
 *
 * Manages sequence tracking and acknowledgment per source→target agent pair.
 * Provides session objects that generate message IDs, sequence numbers, and
 * append envelopes to the ledger when configured.
 *
 * ACK SEMANTICS (NORMATIVE):
 * - ack means received in order up to N
 * - ack advances only to highest contiguous seq where all seq ≤ ack have been received
 * - Out-of-order messages create gaps that prevent ack advancement
 * - Semantic completion is tracked separately in the ledger via requestId status
 */

import type { AACPLedger, AACPSession, AACPSessionInfo, AACPSessionManager as AACPSessionManagerInterface } from './interfaces.js';
import type { AACPPersistenceAdapter } from './persistenceAdapter.js';
import type {
  AACPEnvelope,
  AACPMessageType,
  Destination,
  Priority,
  PropagatedContext,
  TracingContext,
} from './types.js';
import { generateUuidV7 } from '../shared/idGenerator.js';

interface SessionState {
  sourceAgentId: string;
  targetAgentId: string;
  nextSeq: number;
  lastAck: number;
  receivedSeqs: Set<number>;
  createdAt: string;
  lastActivity: string;
}

interface SessionOptions {
  ledger?: AACPLedger;
  idFactory?: () => string;
  protocolVersion?: string;
  defaultPriority?: Priority;
  defaultContext?: () => PropagatedContext;
  defaultTracing?: () => TracingContext;
}

class InMemoryAACPSession implements AACPSession {
  constructor(
    private readonly state: SessionState,
    private readonly persistenceAdapter: AACPPersistenceAdapter,
    private readonly options: SessionOptions
  ) {}

  get sourceAgentId(): string {
    return this.state.sourceAgentId;
  }

  get targetAgentId(): string {
    return this.state.targetAgentId;
  }

  get nextSeq(): number {
    return this.state.nextSeq;
  }

  get lastAck(): number {
    return this.state.lastAck;
  }

  async sendMessage(payload: unknown, messageType: AACPMessageType, requestId?: string): Promise<string> {
    const messageId = this.options.idFactory ? this.options.idFactory() : generateUuidV7();
    const seq = this.state.nextSeq;
    this.state.nextSeq += 1;
    this.state.lastActivity = new Date().toISOString();

    await this.persistenceAdapter.updateLastSequence(this.state.sourceAgentId, this.state.targetAgentId, seq);

    const envelopeOptions: Parameters<typeof buildEnvelope>[0] = {
      messageId,
      payload,
      messageType,
      seq,
      ack: this.state.lastAck,
      sourceAgentId: this.state.sourceAgentId,
      targetAgentId: this.state.targetAgentId,
    };
    if (this.options.protocolVersion) {
      envelopeOptions.protocolVersion = this.options.protocolVersion;
    }
    if (this.options.defaultPriority) {
      envelopeOptions.priority = this.options.defaultPriority;
    }
    if (this.options.defaultContext) {
      envelopeOptions.contextFactory = this.options.defaultContext;
    }
    if (this.options.defaultTracing) {
      envelopeOptions.tracingFactory = this.options.defaultTracing;
    }
    if (requestId !== undefined) {
      envelopeOptions.requestId = requestId;
    }
    const envelope = buildEnvelope(envelopeOptions);

    if (this.options.ledger) {
      await this.options.ledger.append(envelope);
    }

    return messageId;
  }

  acknowledgeMessage(seq: number): Promise<void> {
    this.state.receivedSeqs.add(seq);
    this.state.lastActivity = new Date().toISOString();

    let newAck = this.state.lastAck;
    while (this.state.receivedSeqs.has(newAck + 1)) {
      newAck += 1;
      this.state.receivedSeqs.delete(newAck);
    }
    this.state.lastAck = newAck;
    return Promise.resolve();
  }

  async getUnacknowledgedMessages(): Promise<AACPEnvelope[]> {
    return this.persistenceAdapter.getUnacknowledgedMessages(this.state.sourceAgentId, this.state.targetAgentId);
  }
}

export class AACPSessionManager implements AACPSessionManagerInterface {
  private readonly sessions = new Map<string, SessionState>();
  private readonly options: SessionOptions;

  constructor(
    private readonly persistenceAdapter: AACPPersistenceAdapter,
    options: SessionOptions = {}
  ) {
    const base: SessionOptions = {
      idFactory: options.idFactory ?? generateUuidV7,
      protocolVersion: options.protocolVersion ?? '1.0.0',
      defaultPriority: options.defaultPriority ?? 'normal',
      defaultContext: options.defaultContext ?? (() => ({})),
      defaultTracing: options.defaultTracing ?? createDefaultTracing,
    };
    if (options.ledger) {
      base.ledger = options.ledger;
    }
    this.options = base;
  }

  async createSession(sourceAgentId: string, targetAgentId: string): Promise<AACPSession> {
    const session = await this.getOrCreateState(sourceAgentId, targetAgentId);
    return new InMemoryAACPSession(session, this.persistenceAdapter, this.options);
  }

  getSession(sourceAgentId: string, targetAgentId: string): Promise<AACPSession | null> {
    const sessionKey = `${sourceAgentId}:${targetAgentId}`;
    const session = this.sessions.get(sessionKey);
    if (!session) {
      return Promise.resolve(null);
    }
    return Promise.resolve(new InMemoryAACPSession(session, this.persistenceAdapter, this.options));
  }

  closeSession(sourceAgentId: string, targetAgentId: string): Promise<void> {
    const sessionKey = `${sourceAgentId}:${targetAgentId}`;
    this.sessions.delete(sessionKey);
    return Promise.resolve();
  }

  listSessions(): Promise<AACPSessionInfo[]> {
    return Promise.resolve(
      Array.from(this.sessions.values()).map((session) => ({
        sourceAgentId: session.sourceAgentId,
        targetAgentId: session.targetAgentId,
        nextSeq: session.nextSeq,
        lastAck: session.lastAck,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
      }))
    );
  }

  // --- Compatibility helpers (v0.1) ---
  async getNextSeq(sourceAgentId: string, targetAgentId: string): Promise<number> {
    const session = await this.getOrCreateState(sourceAgentId, targetAgentId);
    const seq = session.nextSeq;
    session.nextSeq += 1;
    session.lastActivity = new Date().toISOString();
    await this.persistenceAdapter.updateLastSequence(sourceAgentId, targetAgentId, seq);
    return seq;
  }

  async getLastAck(sourceAgentId: string, targetAgentId: string): Promise<number> {
    const session = await this.getOrCreateState(sourceAgentId, targetAgentId);
    return session.lastAck;
  }

  async acknowledgeMessage(sourceAgentId: string, targetAgentId: string, seq: number): Promise<void> {
    const session = await this.getOrCreateState(sourceAgentId, targetAgentId);
    await this.applyAck(session, seq);
  }

  async hasGap(sourceAgentId: string, targetAgentId: string, seq: number): Promise<boolean> {
    const session = await this.getOrCreateState(sourceAgentId, targetAgentId);
    if (seq <= session.lastAck + 1) {
      return false;
    }
    for (let i = session.lastAck + 1; i < seq; i += 1) {
      if (!session.receivedSeqs.has(i)) {
        return true;
      }
    }
    return false;
  }

  getStats(): { activeSessions: number; totalReceivedSeqs: number } {
    let totalReceivedSeqs = 0;
    for (const session of this.sessions.values()) {
      totalReceivedSeqs += session.receivedSeqs.size;
    }
    return {
      activeSessions: this.sessions.size,
      totalReceivedSeqs,
    };
  }

  clear(): void {
    this.sessions.clear();
  }

  private async getOrCreateState(sourceAgentId: string, targetAgentId: string): Promise<SessionState> {
    const sessionKey = `${sourceAgentId}:${targetAgentId}`;
    let session = this.sessions.get(sessionKey);
    if (!session) {
      const lastSeq = await this.persistenceAdapter.getLastSequence(sourceAgentId, targetAgentId);
      const now = new Date().toISOString();
      session = {
        sourceAgentId,
        targetAgentId,
        nextSeq: lastSeq + 1,
        lastAck: 0,
        receivedSeqs: new Set<number>(),
        createdAt: now,
        lastActivity: now,
      };
      this.sessions.set(sessionKey, session);
    }
    return session;
  }

  private applyAck(session: SessionState, seq: number): Promise<void> {
    session.receivedSeqs.add(seq);
    session.lastActivity = new Date().toISOString();
    let newAck = session.lastAck;
    while (session.receivedSeqs.has(newAck + 1)) {
      newAck += 1;
      session.receivedSeqs.delete(newAck);
    }
    session.lastAck = newAck;
    return Promise.resolve();
  }
}

function buildEnvelope(options: {
  messageId: string;
  requestId?: string;
  payload: unknown;
  messageType: AACPMessageType;
  seq: number;
  ack: number;
  sourceAgentId: string;
  targetAgentId: string;
  protocolVersion?: string;
  priority?: Priority;
  contextFactory?: () => PropagatedContext;
  tracingFactory?: () => TracingContext;
}): AACPEnvelope {
  const payloadRecord = options.payload && typeof options.payload === 'object'
    ? (options.payload as Record<string, unknown>)
    : undefined;

  const correlationId =
    (payloadRecord?.['correlationId'] as string | undefined) ??
    options.requestId ??
    options.messageId;
  const causationId = payloadRecord?.['causationId'] as string | undefined;
  const payloadType = (payloadRecord?.['messageType'] as string | undefined) ?? options.messageType;

  const destination: Destination = { type: 'direct', agentId: options.targetAgentId };
  const context = options.contextFactory ? options.contextFactory() : {};
  const tracing = options.tracingFactory ? options.tracingFactory() : createDefaultTracing();

  const envelope: AACPEnvelope = {
    id: options.messageId,
    correlationId,
    source: {
      id: options.sourceAgentId,
      type: 'unknown',
      phase: 0,
    },
    destination,
    type: payloadType,
    version: options.protocolVersion ?? '1.0.0',
    timestamp: new Date().toISOString(),
    priority: options.priority ?? 'normal',
    context,
    tracing,
    payload: options.payload,
    seq: options.seq,
  };
  if (options.requestId !== undefined) {
    envelope.requestId = options.requestId;
  }
  envelope.messageType = options.messageType;
  if (options.ack > 0) {
    envelope.ack = options.ack;
  }
  if (causationId !== undefined) {
    envelope.causationId = causationId;
  };
  return envelope;
}

function createDefaultTracing(): TracingContext {
  return {
    traceId: generateUuidV7(),
    spanId: generateUuidV7(),
    sampled: false,
    baggage: {},
  };
}
