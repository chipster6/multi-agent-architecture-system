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
export const logger = new Logger<ILogObj>({
  type: 'pretty',
  name: 'MultiAgentArchitecture',
  minLevel: process.env['NODE_ENV'] === 'production' ? 2 : 0, // INFO level in production, SILLY in development
  prettyLogTemplate: '{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}} {{logLevelName}} [{{name}}] ',
  prettyLogStyles: {
    logLevelName: {
      SILLY: ['dim'],
      TRACE: ['dim'],
      DEBUG: ['cyan'],
      INFO: ['blue'],
      WARN: ['yellow'],
      ERROR: ['red'],
      FATAL: ['bold', 'red'],
    },
    name: ['magenta'],
    dateIsoStr: ['dim'],
  },
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