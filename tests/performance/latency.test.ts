/**
 * Performance Tests - Latency and Throughput (Task 8.13)
 * 
 * Tests performance metrics for tool invocation latency and concurrent throughput.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startTestServer, initializeTestServer, sendToolsCall } from '../helpers/testHarness.js';
import type { TestServerInstance } from '../helpers/testHarness.js';

// Performance SLA targets (configurable)
const PERFORMANCE_TARGETS = {
  p50LatencyMs: 25,    // p50 < 25ms for no-op tool
  p95LatencyMs: 50,    // p95 < 50ms for no-op tool
  maxConcurrentExecutions: 10,
  minThroughputPerSecond: 100, // Minimum requests per second under load
  maxMemoryGrowthMB: 50, // Maximum memory growth during sustained operation
};

interface LatencyMeasurement {
  startTime: number;
  endTime: number;
  durationMs: number;
  success: boolean;
  errorCode?: string;
}

describe('Performance Tests', () => {
  let testServer: TestServerInstance;

  beforeEach(async () => {
    testServer = await startTestServer({
      resources: {
        maxConcurrentExecutions: PERFORMANCE_TARGETS.maxConcurrentExecutions
      },
      tools: {
        defaultTimeoutMs: 30000,
        maxPayloadBytes: 1048576,
        maxStateBytes: 2097152,
        adminRegistrationEnabled: false,
        adminPolicy: { mode: 'deny_all' }
      }
    });
    await initializeTestServer(testServer);
  });

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
    }
  });

  describe('Tool Invocation Latency', () => {
    it('should measure p50/p95 latency for health tool (no-op equivalent)', async () => {
      const measurements: LatencyMeasurement[] = [];
      const iterations = 100; // Sufficient for p95 calculation

      // Warm up
      for (let i = 0; i < 5; i++) {
        await testServer.sendRequest(sendToolsCall('health', {}));
      }

      // Measure latency
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        try {
          const response = await testServer.sendRequest(
            sendToolsCall('health', {}, { correlationId: `perf-${i}` })
          );
          
          const endTime = performance.now();
          const durationMs = endTime - startTime;
          
          measurements.push({
            startTime,
            endTime,
            durationMs,
            success: !!(response.result && !(response.result as any).isError)
          });
        } catch (error) {
          const endTime = performance.now();
          measurements.push({
            startTime,
            endTime,
            durationMs: endTime - startTime,
            success: false,
            errorCode: 'EXCEPTION'
          });
        }
      }

      // Calculate percentiles
      const successfulMeasurements = measurements
        .filter(m => m.success)
        .map(m => m.durationMs)
        .sort((a, b) => a - b);

      expect(successfulMeasurements.length).toBeGreaterThan(iterations * 0.95); // 95% success rate

      const p50Index = Math.floor(successfulMeasurements.length * 0.5);
      const p95Index = Math.floor(successfulMeasurements.length * 0.95);
      
      const p50Latency = successfulMeasurements[p50Index];
      const p95Latency = successfulMeasurements[p95Index];

      console.log(`Performance Results:
        - Iterations: ${iterations}
        - Success Rate: ${(successfulMeasurements.length / iterations * 100).toFixed(1)}%
        - P50 Latency: ${p50Latency.toFixed(2)}ms
        - P95 Latency: ${p95Latency.toFixed(2)}ms
        - Min Latency: ${successfulMeasurements[0].toFixed(2)}ms
        - Max Latency: ${successfulMeasurements[successfulMeasurements.length - 1].toFixed(2)}ms`);

      // Verify SLA targets
      expect(p50Latency).toBeLessThan(PERFORMANCE_TARGETS.p50LatencyMs);
      expect(p95Latency).toBeLessThan(PERFORMANCE_TARGETS.p95LatencyMs);
    });

    it('should measure latency distribution and identify outliers', async () => {
      const measurements: number[] = [];
      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        await testServer.sendRequest(sendToolsCall('health', {}));
        const endTime = performance.now();
        
        measurements.push(endTime - startTime);
      }

      measurements.sort((a, b) => a - b);

      const mean = measurements.reduce((sum, val) => sum + val, 0) / measurements.length;
      const median = measurements[Math.floor(measurements.length / 2)];
      const min = measurements[0];
      const max = measurements[measurements.length - 1];

      // Calculate standard deviation
      const variance = measurements.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / measurements.length;
      const stdDev = Math.sqrt(variance);

      console.log(`Latency Distribution:
        - Mean: ${mean.toFixed(2)}ms
        - Median: ${median.toFixed(2)}ms
        - Min: ${min.toFixed(2)}ms
        - Max: ${max.toFixed(2)}ms
        - Std Dev: ${stdDev.toFixed(2)}ms`);

      // Verify reasonable distribution (no extreme outliers) - Context7 pattern for statistical tolerance
      // Use very lenient thresholds for test environment statistical variance
      const maxOutlierThreshold = Math.max(mean + 5 * stdDev, mean * 3, 10); // Allow up to 5 std devs, 3x mean, or 10ms minimum
      const coefficientOfVariation = stdDev / mean;
      
      // Very lenient checks - focus on detecting truly pathological behavior only
      expect(max).toBeLessThan(maxOutlierThreshold); // Within 5 standard deviations, 3x mean, or 10ms
      expect(coefficientOfVariation).toBeLessThan(2.0); // Coefficient of variation < 200% (very lenient)
    });
  });

  describe('Concurrent Throughput', () => {
    it('should measure throughput under concurrent load', async () => {
      const concurrency = Math.min(5, PERFORMANCE_TARGETS.maxConcurrentExecutions);
      const requestsPerWorker = 20;
      const totalRequests = concurrency * requestsPerWorker;

      const startTime = performance.now();
      
      // Create concurrent workers
      const workers = Array.from({ length: concurrency }, async (_, workerId) => {
        const workerResults: Array<{
          success: boolean;
          workerId: number;
          requestId: number;
          error?: string;
        }> = [];
        
        for (let i = 0; i < requestsPerWorker; i++) {
          try {
            const response = await testServer.sendRequest(
              sendToolsCall('health', {}, { correlationId: `worker-${workerId}-${i}` })
            );
            
            workerResults.push({
              success: !!(response.result && !(response.result as any).isError),
              workerId,
              requestId: i
            });
          } catch (error) {
            workerResults.push({
              success: false,
              workerId,
              requestId: i,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
        
        return workerResults;
      });

      const allResults = await Promise.all(workers);
      const endTime = performance.now();
      
      const totalDurationMs = endTime - startTime;
      const totalDurationSec = totalDurationMs / 1000;
      
      const flatResults = allResults.flat();
      const successfulRequests = flatResults.filter(r => r.success).length;
      const throughput = successfulRequests / totalDurationSec;

      console.log(`Throughput Results:
        - Concurrency: ${concurrency}
        - Total Requests: ${totalRequests}
        - Successful Requests: ${successfulRequests}
        - Success Rate: ${(successfulRequests / totalRequests * 100).toFixed(1)}%
        - Total Duration: ${totalDurationMs.toFixed(0)}ms
        - Throughput: ${throughput.toFixed(1)} req/sec`);

      // Verify throughput targets
      expect(successfulRequests).toBeGreaterThan(totalRequests * 0.95); // 95% success rate
      expect(throughput).toBeGreaterThan(PERFORMANCE_TARGETS.minThroughputPerSecond);
    });

    it('should handle maximum concurrent executions without degradation', async () => {
      const maxConcurrency = PERFORMANCE_TARGETS.maxConcurrentExecutions;
      
      // Test at maximum concurrency
      const promises = Array.from({ length: maxConcurrency }, (_, i) => 
        testServer.sendRequest(
          sendToolsCall('health', {}, { correlationId: `max-concurrency-${i}` })
        )
      );

      const startTime = performance.now();
      const responses = await Promise.all(promises);
      const endTime = performance.now();
      
      const durationMs = endTime - startTime;
      const successfulResponses = responses.filter(r => 
        r.result && !(r.result as any).isError
      ).length;

      console.log(`Max Concurrency Test:
        - Concurrent Requests: ${maxConcurrency}
        - Successful Responses: ${successfulResponses}
        - Total Duration: ${durationMs.toFixed(0)}ms
        - Average per Request: ${(durationMs / maxConcurrency).toFixed(1)}ms`);

      // Should handle all requests successfully
      expect(successfulResponses).toBe(maxConcurrency);
      
      // Should not take significantly longer than single request
      const avgLatencyMs = durationMs / maxConcurrency;
      expect(avgLatencyMs).toBeLessThan(PERFORMANCE_TARGETS.p95LatencyMs * 2);
    });
  });

  describe('Memory Usage Under Load', () => {
    it('should monitor memory usage during sustained operation', async () => {
      const iterations = 100;
      const memoryMeasurements: number[] = [];
      
      // Get baseline memory usage
      const baselineMemory = process.memoryUsage().heapUsed / 1024 / 1024; // MB
      memoryMeasurements.push(baselineMemory);

      // Sustained operation
      for (let i = 0; i < iterations; i++) {
        await testServer.sendRequest(sendToolsCall('health', {}));
        
        // Measure memory every 10 iterations
        if (i % 10 === 0) {
          const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
          memoryMeasurements.push(currentMemory);
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      memoryMeasurements.push(finalMemory);

      const maxMemory = Math.max(...memoryMeasurements);
      const memoryGrowth = maxMemory - baselineMemory;

      console.log(`Memory Usage Results:
        - Baseline Memory: ${baselineMemory.toFixed(1)}MB
        - Max Memory: ${maxMemory.toFixed(1)}MB
        - Final Memory: ${finalMemory.toFixed(1)}MB
        - Memory Growth: ${memoryGrowth.toFixed(1)}MB
        - Iterations: ${iterations}`);

      // Verify memory growth is within acceptable limits
      expect(memoryGrowth).toBeLessThan(PERFORMANCE_TARGETS.maxMemoryGrowthMB);
      
      // Memory should not grow linearly with requests (no major leaks)
      const memoryGrowthPerRequest = memoryGrowth / iterations;
      expect(memoryGrowthPerRequest).toBeLessThan(0.1); // < 0.1MB per request
    });

    it('should measure memory efficiency of different operations', async () => {
      const operations = [
        { name: 'health', args: {} },
        { name: 'agent/list', args: {} },
        { name: 'agent/getState', args: { agentId: 'nonexistent' } }
      ];

      const results: Record<string, { memoryBefore: number; memoryAfter: number; duration: number }> = {};

      for (const operation of operations) {
        // Measure memory before operation
        if (global.gc) global.gc();
        const memoryBefore = process.memoryUsage().heapUsed / 1024 / 1024;
        
        const startTime = performance.now();
        
        // Perform multiple operations to amplify memory usage
        for (let i = 0; i < 10; i++) {
          await testServer.sendRequest(sendToolsCall(operation.name, operation.args));
        }
        
        const endTime = performance.now();
        const memoryAfter = process.memoryUsage().heapUsed / 1024 / 1024;
        
        results[operation.name] = {
          memoryBefore,
          memoryAfter,
          duration: endTime - startTime
        };
      }

      console.log('Memory Efficiency by Operation:');
      Object.entries(results).forEach(([name, result]) => {
        const memoryDelta = result.memoryAfter - result.memoryBefore;
        console.log(`  ${name}: ${memoryDelta.toFixed(2)}MB delta, ${result.duration.toFixed(0)}ms`);
      });

      // All operations should have reasonable memory usage
      Object.values(results).forEach(result => {
        const memoryDelta = result.memoryAfter - result.memoryBefore;
        expect(memoryDelta).toBeLessThan(10); // < 10MB for 10 operations
      });
    });
  });

  describe('Performance Regression Detection', () => {
    it('should establish performance baseline for regression testing', async () => {
      const testCases = [
        { name: 'single-health-call', iterations: 1 },
        { name: 'batch-health-calls', iterations: 10 },
        { name: 'concurrent-health-calls', iterations: 5, concurrent: true }
      ];

      const baseline: Record<string, { avgLatency: number; throughput: number }> = {};

      for (const testCase of testCases) {
        const measurements: number[] = [];
        const startTime = performance.now();

        if (testCase.concurrent) {
          // Concurrent execution
          const promises = Array.from({ length: testCase.iterations }, (_, i) =>
            testServer.sendRequest(sendToolsCall('health', {}, { correlationId: `baseline-${i}` }))
          );
          
          const responses = await Promise.all(promises);
          const endTime = performance.now();
          
          const totalDuration = endTime - startTime;
          const avgLatency = totalDuration / testCase.iterations;
          const throughput = testCase.iterations / (totalDuration / 1000);
          
          baseline[testCase.name] = { avgLatency, throughput };
        } else {
          // Sequential execution
          for (let i = 0; i < testCase.iterations; i++) {
            const iterStart = performance.now();
            await testServer.sendRequest(sendToolsCall('health', {}));
            const iterEnd = performance.now();
            
            measurements.push(iterEnd - iterStart);
          }
          
          const avgLatency = measurements.reduce((sum, val) => sum + val, 0) / measurements.length;
          const totalDuration = performance.now() - startTime;
          const throughput = testCase.iterations / (totalDuration / 1000);
          
          baseline[testCase.name] = { avgLatency, throughput };
        }
      }

      console.log('Performance Baseline:');
      Object.entries(baseline).forEach(([name, metrics]) => {
        console.log(`  ${name}: ${metrics.avgLatency.toFixed(2)}ms avg, ${metrics.throughput.toFixed(1)} req/sec`);
      });

      // Store baseline for future regression testing
      // In a real scenario, this would be saved to a file or database
      expect(Object.keys(baseline)).toHaveLength(testCases.length);
      
      // Verify all measurements are reasonable
      Object.values(baseline).forEach(metrics => {
        expect(metrics.avgLatency).toBeGreaterThan(0);
        expect(metrics.avgLatency).toBeLessThan(1000); // < 1 second
        expect(metrics.throughput).toBeGreaterThan(1); // > 1 req/sec
      });
    });
  });
});