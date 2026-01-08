/**
 * Phase 9: DevOps & Infrastructure Agent
 *
 * Designs and recommends DevOps infrastructure including:
 * - CI/CD pipeline architecture
 * - Container orchestration (Docker, Kubernetes)
 * - Infrastructure as Code (Terraform, CloudFormation)
 * - Monitoring and logging
 * - Deployment strategies
 * - Release management
 */

import { BaseAgent } from '../base-agent.js';
import type { BaseAgentInput } from '../base-agent.js';
import type { ArchitecturalDecision, Artifact } from '../../shared/types/index.js';

export interface DevOpsAnalysis {
  cicdStrategy: string;
  containerStrategy: string;
  orchestrationPlatform: string;
  infrastructureAsCode: string;
  monitoringStack: string;
  deploymentStrategy: string;
}

export class DevOpsInfrastructureAgent extends BaseAgent {
  constructor() {
    super(
      'devops-infrastructure-agent',
      'phase-9-devops',
      [
        'ci-cd-pipeline',
        'container-orchestration',
        'infrastructure-as-code',
        'monitoring-logging',
        'deployment-strategy',
        'release-management',
      ],
      [
        'infrastructure-design-agent',
        'security-architecture-agent',
        'performance-optimization-agent',
      ]
    );
  }

  protected analyze(input: BaseAgentInput): Promise<DevOpsAnalysis> {
    const context = input.context as Record<string, unknown>;
    const infrastructure = context['infrastructure'] as Record<string, unknown>;
    const deployment = context['deployment'] as Record<string, unknown>;

    return Promise.resolve({
      cicdStrategy: this.analyzeCICDStrategy(infrastructure),
      containerStrategy: this.analyzeContainerStrategy(infrastructure),
      orchestrationPlatform: this.selectOrchestrationPlatform(infrastructure),
      infrastructureAsCode: this.selectIaCTool(infrastructure),
      monitoringStack: this.selectMonitoringStack(infrastructure),
      deploymentStrategy: this.selectDeploymentStrategy(deployment),
    });
  }

  protected decide(
    _analysis: DevOpsAnalysis,
    _input: BaseAgentInput
  ): Promise<ArchitecturalDecision[]> {
    const decisions: ArchitecturalDecision[] = [];

    // CI/CD Pipeline decision
    decisions.push({
      id: `devops-cicd-${Date.now()}`,
      decision: 'GitHub Actions for CI/CD with multi-stage workflows',
      rationale:
        'GitHub Actions provides native integration, matrix testing, and artifact management',
      category: 'ci-cd-pipeline',
      dependencies: [],
      alternatives: [
        'GitLab CI/CD',
        'Jenkins',
        'CircleCI',
        'AWS CodePipeline',
      ],
      consequences: [
        'Tight GitHub integration',
        'No additional infrastructure needed',
        'Built-in secret management',
        'Vendor lock-in to GitHub',
      ],
      confidence: 0.9,
      agentId: this.agentId,
      phase: this.phase,
      timestamp: new Date().toISOString(),
    });

    // Container orchestration decision
    decisions.push({
      id: `devops-orchestration-${Date.now()}`,
      decision: 'Kubernetes for container orchestration',
      rationale:
        'Industry standard with auto-scaling, self-healing, and declarative configuration',
      category: 'container-orchestration',
      dependencies: [],
      alternatives: [
        'Docker Swarm',
        'AWS ECS',
        'Nomad',
        'Manual container management',
      ],
      consequences: [
        'Powerful orchestration capabilities',
        'Steep learning curve',
        'Operational complexity',
        'Excellent community support',
      ],
      confidence: 0.88,
      agentId: this.agentId,
      phase: this.phase,
      timestamp: new Date().toISOString(),
    });

    // Infrastructure as Code decision
    decisions.push({
      id: `devops-iac-${Date.now()}`,
      decision: 'Terraform for Infrastructure as Code',
      rationale:
        'Cloud-agnostic, declarative, with strong state management and modularity',
      category: 'infrastructure-as-code',
      dependencies: [],
      alternatives: [
        'CloudFormation',
        'Pulumi',
        'Ansible',
        'Manual provisioning',
      ],
      consequences: [
        'Version-controlled infrastructure',
        'Reproducible deployments',
        'State management complexity',
        'Multi-cloud support',
      ],
      confidence: 0.87,
      agentId: this.agentId,
      phase: this.phase,
      timestamp: new Date().toISOString(),
    });

    // Monitoring and logging decision
    decisions.push({
      id: `devops-monitoring-${Date.now()}`,
      decision: 'Prometheus + Grafana + ELK Stack for observability',
      rationale:
        'Open-source, scalable, and provides comprehensive metrics, logs, and visualization',
      category: 'monitoring-logging',
      dependencies: [],
      alternatives: [
        'Datadog',
        'New Relic',
        'Splunk',
        'CloudWatch',
      ],
      consequences: [
        'Self-hosted infrastructure required',
        'Full control over data',
        'Operational overhead',
        'Cost-effective at scale',
      ],
      confidence: 0.85,
      agentId: this.agentId,
      phase: this.phase,
      timestamp: new Date().toISOString(),
    });

    // Deployment strategy decision
    decisions.push({
      id: `devops-deployment-${Date.now()}`,
      decision: 'Blue-Green deployments with canary releases',
      rationale:
        'Minimize downtime and risk with gradual rollout and instant rollback capability',
      category: 'deployment-strategy',
      dependencies: [],
      alternatives: [
        'Rolling updates',
        'Big bang deployments',
        'Feature flags only',
        'Shadow deployments',
      ],
      consequences: [
        'Zero-downtime deployments',
        'Increased infrastructure costs',
        'Complex deployment logic',
        'Easy rollback capability',
      ],
      confidence: 0.89,
      agentId: this.agentId,
      phase: this.phase,
      timestamp: new Date().toISOString(),
    });

    return Promise.resolve(decisions);
  }

  private analyzeCICDStrategy(_infrastructure: Record<string, unknown>): string {
    return 'Multi-stage CI/CD with automated testing, building, and deployment';
  }

  private analyzeContainerStrategy(
    _infrastructure: Record<string, unknown>
  ): string {
    return 'Multi-stage Docker builds with Alpine base images and non-root users';
  }

  private selectOrchestrationPlatform(
    _infrastructure: Record<string, unknown>
  ): string {
    return 'Kubernetes with managed service (EKS, GKE, or AKS)';
  }

  private selectIaCTool(_infrastructure: Record<string, unknown>): string {
    return 'Terraform with modular structure and remote state management';
  }

  private selectMonitoringStack(_infrastructure: Record<string, unknown>): string {
    return 'Prometheus for metrics, Grafana for visualization, ELK for logs';
  }

  private selectDeploymentStrategy(_deployment: Record<string, unknown>): string {
    return 'Blue-Green with canary releases and automated rollback';
  }

  protected override async generateArtifacts(
    decisions: ArchitecturalDecision[],
    _input: BaseAgentInput
  ): Promise<Artifact[]> {
    const artifacts = await super.generateArtifacts(decisions, _input);

    // Add CI/CD pipeline template
    artifacts.push({
      id: `devops-cicd-template-${Date.now()}`,
      type: 'document',
      name: 'GitHub Actions CI/CD Pipeline Template',
      content: this.generateCICDTemplate(),
      format: 'yaml',
      agentId: this.agentId,
      phase: this.phase,
      timestamp: new Date().toISOString(),
    });

    // Add Dockerfile template
    artifacts.push({
      id: `devops-dockerfile-${Date.now()}`,
      type: 'document',
      name: 'Multi-Stage Dockerfile Template',
      content: this.generateDockerfileTemplate(),
      format: 'dockerfile',
      agentId: this.agentId,
      phase: this.phase,
      timestamp: new Date().toISOString(),
    });

    // Add Kubernetes deployment template
    artifacts.push({
      id: `devops-k8s-${Date.now()}`,
      type: 'specification',
      name: 'Kubernetes Deployment Template',
      content: this.generateKubernetesTemplate(),
      format: 'yaml',
      agentId: this.agentId,
      phase: this.phase,
      timestamp: new Date().toISOString(),
    });

    // Add DevOps runbook
    artifacts.push({
      id: `devops-runbook-${Date.now()}`,
      type: 'document',
      name: 'DevOps Operations Runbook',
      content: this.generateRunbook(),
      format: 'markdown',
      agentId: this.agentId,
      phase: this.phase,
      timestamp: new Date().toISOString(),
    });

    return artifacts;
  }

  private generateCICDTemplate(): string {
    return `name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: \${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build

  build:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Kubernetes
        run: |
          kubectl set image deployment/app app=\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:latest
          kubectl rollout status deployment/app
`;
  }

  private generateDockerfileTemplate(): string {
    return `# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \\
    adduser -S nodejs -u 1001 -G nodejs

# Copy production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \\
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/server.js"]
`;
  }

  private generateKubernetesTemplate(): string {
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  labels:
    app: app
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      containers:
      - name: app
        image: ghcr.io/org/app:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: NODE_ENV
          value: production
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: app
spec:
  type: LoadBalancer
  selector:
    app: app
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: app
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
`;
  }

  private generateRunbook(): string {
    return `# DevOps Operations Runbook

## Deployment Procedures

### Standard Deployment
1. Create feature branch from main
2. Make changes and push to GitHub
3. GitHub Actions runs tests and builds image
4. Create pull request for review
5. After approval, merge to main
6. GitHub Actions automatically deploys to production

### Emergency Rollback
\`\`\`bash
kubectl rollout undo deployment/app
kubectl rollout status deployment/app
\`\`\`

### Manual Scaling
\`\`\`bash
kubectl scale deployment app --replicas=5
\`\`\`

## Monitoring and Troubleshooting

### View Logs
\`\`\`bash
kubectl logs -f deployment/app
\`\`\`

### Check Pod Status
\`\`\`bash
kubectl get pods -l app=app
kubectl describe pod <pod-name>
\`\`\`

### Access Metrics
- Prometheus: http://prometheus.example.com
- Grafana: http://grafana.example.com
- Kibana: http://kibana.example.com

## Incident Response

### High CPU Usage
1. Check current load: \`kubectl top pods\`
2. Scale up if needed: \`kubectl scale deployment app --replicas=10\`
3. Investigate root cause in logs
4. Scale down after issue resolved

### Pod Crashes
1. Check logs: \`kubectl logs <pod-name>\`
2. Check events: \`kubectl describe pod <pod-name>\`
3. Check resource limits
4. Restart pod if needed: \`kubectl delete pod <pod-name>\`

### Database Connection Issues
1. Verify database is accessible
2. Check connection pool settings
3. Review database logs
4. Restart application pods if needed
`;
  }
}
