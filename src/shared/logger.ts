/**
 * Centralized Logger Configuration
 * 
 * Provides structured logging for the Multi-Agent Architecture Design System
 * using tslog for better observability and debugging capabilities.
 */

import { Logger } from 'tslog';

// Define log object interface for structured logging
interface ILogObj {
  sessionId?: string | undefined;
  agentId?: string;
  phase?: string;
  component?: string;
}

// Create the main logger instance with structured configuration
// IMPORTANT: Write logs to stderr only to avoid corrupting stdio MCP transport.
export const logger = new Logger<ILogObj>({
  type: 'json',
  name: 'MultiAgentArchitecture',
  minLevel: process.env['NODE_ENV'] === 'production' ? 2 : 0, // INFO level in production, SILLY in development
  overwrite: {
    transportJSON: (logObj: unknown) => {
      const payload = typeof logObj === 'string' ? logObj : JSON.stringify(logObj);
      process.stderr.write(payload + '\n');
    }
  }
});

// Create specialized loggers for different components
export const createComponentLogger = (component: string, sessionId?: string): Logger<ILogObj> => {
  const logObj: ILogObj = {
    component,
    ...(sessionId && { sessionId }),
  };
  
  return logger.getSubLogger({
    name: component,
  }, logObj);
};

export const createAgentLogger = (agentId: string, phase: string, sessionId?: string): Logger<ILogObj> => {
  const logObj: ILogObj = {
    agentId,
    phase,
    ...(sessionId && { sessionId }),
  };
  
  return logger.getSubLogger({
    name: `Agent:${agentId}`,
  }, logObj);
};

// Export default logger for general use
export default logger;
