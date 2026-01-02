/**
 * Shared type definitions for the Multi-Agent Architecture Design System
 */

export interface ArchitectureContext {
  sessionId: string;
  timestamp: string;
  phase: string;
  decisions: ArchitecturalDecision[];
  artifacts: Artifact[];
  conflicts: Conflict[];
}

export interface ArchitecturalDecision {
  id: string;
  agentId: string;
  phase: string;
  category: string;
  decision: string;
  rationale: string;
  alternatives: string[];
  consequences: string[];
  confidence: number;
  timestamp: string;
  dependencies: string[];
}

export interface Artifact {
  id: string;
  type: 'diagram' | 'document' | 'specification' | 'model';
  name: string;
  content: string;
  format: string;
  agentId: string;
  phase: string;
  timestamp: string;
}

export interface Conflict {
  id: string;
  type: 'contradiction' | 'constraint_violation' | 'dependency_cycle';
  description: string;
  involvedDecisions: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolution?: ConflictResolution;
}

export interface ConflictResolution {
  strategy: string;
  modifiedDecisions: string[];
  newDecisions: ArchitecturalDecision[];
  rationale: string;
}

export interface RequirementsAnalysis {
  requirements: BusinessRequirement[];
  domainModel: DomainModel;
  systemTopology: SystemTopology;
  constraints: Constraint[];
  confidence: number;
}

export interface BusinessRequirement {
  id: string;
  type: 'functional' | 'non-functional' | 'constraint';
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  acceptance_criteria: string[];
}

export interface DomainModel {
  entities: Entity[];
  relationships: Relationship[];
  bounded_contexts: BoundedContext[];
}

export interface Entity {
  name: string;
  attributes: Attribute[];
  behaviors: string[];
  invariants: string[];
}

export interface Attribute {
  name: string;
  type: string;
  required: boolean;
  constraints: string[];
}

export interface Relationship {
  from: string;
  to: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  description: string;
}

export interface BoundedContext {
  name: string;
  description: string;
  entities: string[];
  services: string[];
  boundaries: string[];
}

export interface SystemTopology {
  architecture_style: string;
  deployment_model: string;
  integration_patterns: string[];
  data_flow: DataFlow[];
  system_boundaries: SystemBoundary[];
}

export interface DataFlow {
  from: string;
  to: string;
  data_type: string;
  protocol: string;
  frequency: string;
}

export interface SystemBoundary {
  name: string;
  type: 'system' | 'subsystem' | 'service' | 'component';
  responsibilities: string[];
  interfaces: Interface[];
}

export interface Interface {
  name: string;
  type: 'api' | 'event' | 'database' | 'file';
  protocol: string;
  data_format: string;
}

export interface Constraint {
  id: string;
  type: 'technical' | 'business' | 'regulatory' | 'performance';
  description: string;
  impact: string;
  mitigation: string[];
}

export interface ArchitectureBlueprint {
  overview: ArchitectureOverview;
  components?: Component[];
  services?: Service[];
  infrastructure?: Infrastructure;
  security?: SecurityArchitecture;
  data?: DataArchitecture;
  integration?: IntegrationArchitecture;
  deployment?: DeploymentArchitecture;
  adrs?: ArchitectureDecisionRecord[];
  diagrams?: Diagram[];
}

export interface ArchitectureOverview {
  system_name: string;
  description: string;
  architecture_style: string;
  key_principles: string[];
  quality_attributes: QualityAttribute[];
}

export interface QualityAttribute {
  name: string;
  description: string;
  measures: string[];
  targets: string[];
}

export interface Component {
  id: string;
  name: string;
  type: string;
  description: string;
  responsibilities: string[];
  interfaces: Interface[];
  dependencies: string[];
  technology_stack: string[];
}

export interface Service {
  id: string;
  name: string;
  type: 'microservice' | 'api' | 'background' | 'data';
  description: string;
  endpoints: Endpoint[];
  data_stores: string[];
  dependencies: string[];
  sla: ServiceLevelAgreement;
}

export interface Endpoint {
  path: string;
  method: string;
  description: string;
  request_schema: string;
  response_schema: string;
  authentication: string[];
}

export interface ServiceLevelAgreement {
  availability: string;
  response_time: string;
  throughput: string;
  error_rate: string;
}

export interface Infrastructure {
  cloud_provider: string;
  regions: string[];
  compute: ComputeResource[];
  storage: StorageResource[];
  networking: NetworkingResource[];
  monitoring: MonitoringResource[];
}

export interface ComputeResource {
  type: string;
  specification: string;
  scaling: ScalingPolicy;
  cost_estimate: string;
}

export interface StorageResource {
  type: string;
  capacity: string;
  performance: string;
  backup_strategy: string;
}

export interface NetworkingResource {
  type: string;
  configuration: string;
  security_groups: string[];
  load_balancing: string;
}

export interface MonitoringResource {
  type: string;
  metrics: string[];
  alerts: string[];
  dashboards: string[];
}

export interface ScalingPolicy {
  type: 'manual' | 'auto';
  min_instances: number;
  max_instances: number;
  triggers: string[];
}

export interface SecurityArchitecture {
  authentication: AuthenticationStrategy;
  authorization: AuthorizationStrategy;
  encryption: EncryptionStrategy;
  compliance: ComplianceRequirement[];
  threat_model: ThreatModel;
}

export interface AuthenticationStrategy {
  methods: string[];
  providers: string[];
  session_management: string;
  multi_factor: boolean;
}

export interface AuthorizationStrategy {
  model: string;
  policies: string[];
  roles: Role[];
  permissions: Permission[];
}

export interface Role {
  name: string;
  description: string;
  permissions: string[];
}

export interface Permission {
  name: string;
  resource: string;
  actions: string[];
}

export interface EncryptionStrategy {
  at_rest: string[];
  in_transit: string[];
  key_management: string;
}

export interface ComplianceRequirement {
  standard: string;
  requirements: string[];
  controls: string[];
  evidence: string[];
}

export interface ThreatModel {
  assets: string[];
  threats: Threat[];
  mitigations: Mitigation[];
}

export interface Threat {
  id: string;
  description: string;
  likelihood: string;
  impact: string;
  risk_level: string;
}

export interface Mitigation {
  threat_id: string;
  strategy: string;
  implementation: string[];
  effectiveness: string;
}

export interface DataArchitecture {
  data_models: DataModel[];
  storage_strategy: StorageStrategy;
  data_flow: DataFlow[];
  governance: DataGovernance;
}

export interface DataModel {
  name: string;
  entities: Entity[];
  relationships: Relationship[];
  constraints: string[];
}

export interface StorageStrategy {
  databases: Database[];
  caching: CachingStrategy;
  backup: BackupStrategy;
}

export interface Database {
  type: string;
  purpose: string;
  schema: string;
  performance_requirements: string[];
}

export interface CachingStrategy {
  layers: CacheLayer[];
  policies: string[];
  invalidation: string[];
}

export interface CacheLayer {
  name: string;
  type: string;
  ttl: string;
  size: string;
}

export interface BackupStrategy {
  frequency: string;
  retention: string;
  recovery_time: string;
  recovery_point: string;
}

export interface DataGovernance {
  policies: string[];
  classification: string[];
  privacy: PrivacyRequirement[];
  lineage: string[];
}

export interface PrivacyRequirement {
  regulation: string;
  requirements: string[];
  implementation: string[];
}

export interface IntegrationArchitecture {
  patterns: string[];
  protocols: string[];
  apis: ApiSpecification[];
  events: EventSpecification[];
  messaging: MessagingStrategy;
}

export interface ApiSpecification {
  name: string;
  version: string;
  protocol: string;
  endpoints: Endpoint[];
  authentication: string[];
  rate_limiting: string[];
}

export interface EventSpecification {
  name: string;
  schema: string;
  producers: string[];
  consumers: string[];
  delivery_guarantee: string;
}

export interface MessagingStrategy {
  broker: string;
  topics: Topic[];
  patterns: string[];
  reliability: string[];
}

export interface Topic {
  name: string;
  partitions: number;
  retention: string;
  producers: string[];
  consumers: string[];
}

export interface DeploymentArchitecture {
  environments: Environment[];
  pipeline: DeploymentPipeline;
  infrastructure_as_code: InfrastructureAsCode;
  monitoring: MonitoringStrategy;
}

export interface Environment {
  name: string;
  purpose: string;
  configuration: string[];
  resources: string[];
}

export interface DeploymentPipeline {
  stages: PipelineStage[];
  triggers: string[];
  approvals: string[];
  rollback: string[];
}

export interface PipelineStage {
  name: string;
  actions: string[];
  conditions: string[];
  artifacts: string[];
}

export interface InfrastructureAsCode {
  tools: string[];
  templates: string[];
  modules: string[];
  state_management: string;
}

export interface MonitoringStrategy {
  observability: ObservabilityStrategy;
  alerting: AlertingStrategy;
  logging: LoggingStrategy;
  tracing: TracingStrategy;
}

export interface ObservabilityStrategy {
  metrics: string[];
  dashboards: string[];
  slos: string[];
  slis: string[];
}

export interface AlertingStrategy {
  rules: AlertRule[];
  channels: string[];
  escalation: string[];
}

export interface AlertRule {
  name: string;
  condition: string;
  severity: string;
  actions: string[];
}

export interface LoggingStrategy {
  levels: string[];
  formats: string[];
  aggregation: string[];
  retention: string[];
}

export interface TracingStrategy {
  sampling: string;
  correlation: string[];
  storage: string;
  analysis: string[];
}

export interface ArchitectureDecisionRecord {
  id: string;
  title: string;
  status: 'proposed' | 'accepted' | 'deprecated' | 'superseded';
  context: string;
  decision: string;
  consequences: string[];
  alternatives: Alternative[];
  related_decisions: string[];
  date: string;
  author: string;
}

export interface Alternative {
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  rejected_reason: string;
}

export interface Diagram {
  id: string;
  type: 'c4-context' | 'c4-container' | 'c4-component' | 'sequence' | 'deployment';
  title: string;
  description: string;
  content: string;
  format: 'mermaid' | 'plantuml' | 'drawio';
}

export interface ImplementationPlan {
  overview: PlanOverview;
  phases?: ImplementationPhase[];
  tasks?: Task[];
  milestones?: Milestone[];
  resources?: ResourcePlan;
  risks?: Risk[];
  timeline?: Timeline;
}

export interface PlanOverview {
  project_name: string;
  description: string;
  duration: string;
  team_size: number;
  budget_estimate: string;
  success_criteria: string[];
}

export interface ImplementationPhase {
  id: string;
  name: string;
  description: string;
  duration: string;
  dependencies: string[];
  deliverables: string[];
  tasks: string[];
}

export interface Task {
  id: string;
  name: string;
  description: string;
  phase: string;
  effort: string;
  skills_required: string[];
  dependencies: string[];
  acceptance_criteria: string[];
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  date: string;
  deliverables: string[];
  success_criteria: string[];
}

export interface ResourcePlan {
  roles: ResourceRole[];
  tools: string[];
  infrastructure: string[];
  training: string[];
}

export interface ResourceRole {
  title: string;
  count: number;
  skills: string[];
  responsibilities: string[];
  allocation: string;
}

export interface Risk {
  id: string;
  description: string;
  probability: string;
  impact: string;
  mitigation: string[];
  contingency: string[];
}

export interface Timeline {
  start_date: string;
  end_date: string;
  phases: TimelinePhase[];
  critical_path: string[];
}

export interface TimelinePhase {
  phase_id: string;
  start_date: string;
  end_date: string;
  duration: string;
  buffer: string;
}
