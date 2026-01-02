import { StructuredLogger, SystemClock } from './dist/logging/structuredLogger.js';

const logger = new StructuredLogger(new SystemClock());

const testData = {
  password: 'secret-password',
  apiKey: 'sensitive-api-key',
  userInfo: {
    name: 'John Doe',
    token: 'user-token',
    preferences: {
      theme: 'dark',
      secret: 'user-secret'
    }
  }
};

console.log('Testing full logging pipeline...');
console.log('Original:', JSON.stringify(testData, null, 2));

// Capture stderr
const originalWrite = process.stderr.write;
let logOutput = '';
process.stderr.write = function(chunk) {
  logOutput += chunk;
  return true;
};

// Log the data
logger.error('Test error', testData);

// Restore stderr
process.stderr.write = originalWrite;

console.log('Log output:', logOutput);
const logEntry = JSON.parse(logOutput);
console.log('Parsed log entry:', JSON.stringify(logEntry, null, 2));