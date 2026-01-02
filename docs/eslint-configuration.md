# ESLint Configuration Documentation

## Technology Consultation Summary

### Libraries Consulted:

- **Library**: ESLint | **ID**: /eslint/eslint | **Version**: v9.37.0
- **Library**: TypeScript ESLint | **ID**: /typescript-eslint/typescript-eslint | **Version**: v8.0.0
- **Library**: @eslint/js | **ID**: /eslint/eslint | **Version**: v9.37.0
- **Library**: globals | **ID**: globals | **Version**: v15.0.0

### Key Changes:

- **ESLint v9**: Flat config is now the default and recommended format
- **TypeScript ESLint v8**: New unified `typescript-eslint` package replaces separate parser/plugin packages
- **Project Service**: New `projectService` option replaces `project: true` for better performance
- **Flat Config Benefits**: Better module resolution, cleaner configuration, improved performance

### Best Practices:

- Use `defineConfig` for better TypeScript support in configuration files
- Leverage `projectService: true` for type-aware linting with improved stability
- Apply strict TypeScript rules for production MCP server reliability
- Use separate configurations for main code vs. test files
- Enable comprehensive error handling and type safety rules

### Security Updates:

- Updated to ESLint v9 with latest security patches
- Strict TypeScript rules prevent common security vulnerabilities
- Type-aware linting catches potential runtime errors at compile time

## Implementation Adjustments:

### Migration from Legacy Config:

- **Removed**: `.eslintrc.json` (legacy format)
- **Added**: `eslint.config.js` (modern flat config)
- **Updated**: Package dependencies to latest versions
- **Enhanced**: Rule configuration for production MCP server requirements

### Updated Patterns:

- Flat config array format instead of object-based configuration
- Direct module imports instead of string-based extends
- Explicit plugin and parser configuration
- File-pattern-specific rule overrides

### Deprecated Patterns Avoided:

- Legacy `.eslintrc.*` configuration files
- String-based parser and plugin references
- `project: true` in favor of `projectService: true`
- Separate `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` packages

## Configuration Overview

The new ESLint configuration (`eslint.config.js`) provides:

### 1. **Global Ignores**

- `dist/**` - Build output
- `node_modules/**` - Dependencies
- `coverage/**` - Test coverage reports
- `*.js` - JavaScript files (TypeScript-only project)
- `**/*.d.ts` - TypeScript declaration files

### 2. **Base Configuration**

- ESLint recommended rules
- TypeScript ESLint recommended, strict, and stylistic rules
- Modern ES2022 language features
- Node.js environment globals

### 3. **Main TypeScript Files** (`src/**/*.ts`)

- **Type Safety**: Strict TypeScript rules with no `any` types
- **Error Handling**: Comprehensive async/await and promise handling
- **Performance**: Optimized patterns for string operations and loops
- **Consistency**: Naming conventions and code style enforcement
- **Reliability**: Exhaustive switch statements and null checks

### 4. **Test Files** (`tests/**/*.ts`, `**/*.test.ts`, `**/*.spec.ts`)

- **Relaxed Rules**: Allow `any` types for mocking and test utilities
- **Flexibility**: Disabled strict function return types
- **Testing Focus**: Allow console output and empty mock functions

### 5. **Configuration Files** (`*.config.{js,ts,mjs}`)

- **Build Tools**: Relaxed rules for build and configuration scripts
- **Development**: Allow console output for build processes

## Key Rules for Production MCP Server

### Type Safety Rules

```typescript
'@typescript-eslint/no-explicit-any': 'error'
'@typescript-eslint/no-unsafe-any': 'error'
'@typescript-eslint/no-unsafe-assignment': 'error'
'@typescript-eslint/no-unsafe-call': 'error'
'@typescript-eslint/no-unsafe-member-access': 'error'
'@typescript-eslint/no-unsafe-return': 'error'
```

### Async/Promise Handling

```typescript
'@typescript-eslint/no-floating-promises': 'error'
'@typescript-eslint/await-thenable': 'error'
'@typescript-eslint/no-misused-promises': 'error'
'@typescript-eslint/require-await': 'error'
'@typescript-eslint/return-await': ['error', 'always']
```

### Error Handling

```typescript
'@typescript-eslint/only-throw-error': 'error'
'@typescript-eslint/use-unknown-in-catch-clause-variable': 'error'
'prefer-promise-reject-errors': 'error'
```

### Code Quality

```typescript
'@typescript-eslint/strict-boolean-expressions': 'error'
'@typescript-eslint/prefer-nullish-coalescing': 'error'
'@typescript-eslint/prefer-optional-chain': 'error'
'@typescript-eslint/switch-exhaustiveness-check': 'error'
```

## Usage

### Linting Commands

```bash
# Check for linting errors
npm run lint

# Fix auto-fixable issues
npm run lint:fix

# Type checking (separate from linting)
npm run type-check
```

### IDE Integration

The configuration works seamlessly with:

- **VS Code**: ESLint extension with flat config support
- **WebStorm/IntelliJ**: Built-in ESLint support
- **Vim/Neovim**: Various ESLint plugins

### Performance Considerations

- **Project Service**: Uses TypeScript's project service for better performance
- **File Patterns**: Specific glob patterns reduce unnecessary file processing
- **Incremental**: Only lints changed files in most scenarios

## Maintenance

### Updating Dependencies

```bash
# Update ESLint and TypeScript ESLint
npm update eslint typescript-eslint @eslint/js globals

# Check for new rule recommendations
npx eslint --print-config src/index.ts
```

### Adding New Rules

1. Consult Context7 for latest best practices
2. Test rules on existing codebase
3. Add to appropriate configuration section
4. Document rationale in this file

### Troubleshooting

- **Performance Issues**: Check `projectService` configuration and file patterns
- **Type Errors**: Ensure `tsconfig.json` is properly configured
- **Rule Conflicts**: Use `// eslint-disable-next-line` sparingly with justification

This configuration ensures the Multi-Agent Software Architecture Design System maintains the highest code quality standards while leveraging the latest ESLint and TypeScript tooling capabilities.
