CREATE TABLE IF NOT EXISTS decisions (
  id text PRIMARY KEY,
  agent_id text NOT NULL,
  phase text NOT NULL,
  domain text NOT NULL,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decision_json jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS decisions_phase_idx ON decisions (phase);
CREATE INDEX IF NOT EXISTS decisions_domain_idx ON decisions (domain);
CREATE INDEX IF NOT EXISTS decisions_correlation_idx ON decisions (correlation_id);

CREATE TABLE IF NOT EXISTS artifacts (
  id text PRIMARY KEY,
  decision_id text,
  type text NOT NULL,
  name text NOT NULL,
  format text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  content_json jsonb,
  content_path text,
  metadata_json jsonb
);

CREATE INDEX IF NOT EXISTS artifacts_decision_idx ON artifacts (decision_id);

CREATE TABLE IF NOT EXISTS message_summaries (
  id text PRIMARY KEY,
  source_agent_id text NOT NULL,
  target_agent_id text NOT NULL,
  message_type text NOT NULL,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  summary_text text NOT NULL,
  payload_json jsonb
);

CREATE INDEX IF NOT EXISTS message_summaries_correlation_idx ON message_summaries (correlation_id);

CREATE TABLE IF NOT EXISTS aacp_messages (
  id text PRIMARY KEY,
  request_id text,
  correlation_id text,
  causation_id text,
  source_agent_id text NOT NULL,
  target_agent_id text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  envelope_json jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS aacp_messages_request_idx ON aacp_messages (request_id);
CREATE INDEX IF NOT EXISTS aacp_messages_correlation_idx ON aacp_messages (correlation_id);
CREATE INDEX IF NOT EXISTS aacp_messages_causation_idx ON aacp_messages (causation_id);
CREATE INDEX IF NOT EXISTS aacp_messages_status_idx ON aacp_messages (status);

CREATE TABLE IF NOT EXISTS aacp_requests (
  request_id text PRIMARY KEY,
  correlation_id text,
  causation_id text,
  source_agent_id text NOT NULL,
  target_agent_id text NOT NULL,
  message_type text NOT NULL,
  payload_json jsonb,
  status text NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  completion_ref text,
  error_json jsonb
);

CREATE INDEX IF NOT EXISTS aacp_requests_status_idx ON aacp_requests (status);
CREATE INDEX IF NOT EXISTS aacp_requests_correlation_idx ON aacp_requests (correlation_id);
CREATE INDEX IF NOT EXISTS aacp_requests_causation_idx ON aacp_requests (causation_id);

CREATE TABLE IF NOT EXISTS log_entries (
  id bigserial PRIMARY KEY,
  level text NOT NULL,
  message text NOT NULL,
  timestamp timestamptz NOT NULL,
  correlation_id text,
  context_json jsonb
);

CREATE INDEX IF NOT EXISTS log_entries_timestamp_idx ON log_entries (timestamp);
CREATE INDEX IF NOT EXISTS log_entries_correlation_idx ON log_entries (correlation_id);

CREATE TABLE IF NOT EXISTS embeddings (
  id bigserial PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  model text NOT NULL,
  dimensions integer NOT NULL,
  embedding vector(3072) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS embeddings_entity_idx ON embeddings (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS embeddings_hnsw_idx ON embeddings USING hnsw (embedding vector_cosine_ops);
