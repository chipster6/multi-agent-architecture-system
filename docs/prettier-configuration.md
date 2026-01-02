# Prettier Configuration

## Overview

This document explains the Prettier configuration for the Multi-Agent Software Architecture Design System TypeScript project.

## Configuration File: `.prettierrc`

The project uses a JSON-format `.prettierrc` file for simplicity and broad compatibility across development environments.

## Core Configuration Options

### TypeScript & Node.js Optimized Settings

- **`semi: true`** - Uses semicolons for consistency with TypeScript conventions and strict mode requirements
- **`singleQuote: true`** - Uses single quotes for string literals (standard in TypeScript projects)
- **`trailingComma: "es5"`** - Adds trailing commas where valid in ES5 (objects, arrays) for better git diffs
- **`tabWidth: 2`** - Uses 2-space indentation (TypeScript/Node.js standard)
- **`printWidth: 80`** - Limits line length to 80 characters for readability
- **`endOfLine: "lf"`** - Uses LF line endings for cross-platform compatibility
- **`useTabs: false`** - Uses spaces instead of tabs for consistent formatting
- **`bracketSpacing: true`** - Adds spaces inside object literal braces `{ foo: bar }`
- **`bracketSameLine: false`** - Places closing brackets on new lines for better readability
- **`arrowParens: "avoid"`** - Omits parentheses around single arrow function parameters
- **`quoteProps: "as-needed"`** - Only quotes object properties when necessary

## File-Specific Overrides

### JSON Files

```json
{
  "singleQuote": false,
  "trailingComma": "none"
}
```

- Uses double quotes (JSON standard)
- No trailing commas (invalid JSON)

### Markdown Files

```json
{
  "printWidth": 100,
  "proseWrap": "preserve"
}
```

- Longer line length for documentation
- Preserves existing line breaks in prose

### YAML Files

```json
{
  "singleQuote": false
}
```

- Uses double quotes for YAML compatibility

## Integration with Project Architecture

### MCP Server Compatibility

- Configuration aligns with `@modelcontextprotocol/sdk` formatting standards
- Semicolons ensure compatibility with strict TypeScript mode
- Consistent formatting supports multi-agent code generation

### Development Workflow

- Works seamlessly with ESLint configuration (see `eslint.config.js`)
- Supports pre-commit hooks for automated formatting
- Compatible with VS Code and other editors

### Agent-Generated Code

- Consistent formatting ensures agent-generated architecture documentation is readable
- Standardized quote usage prevents conflicts in generated TypeScript interfaces
- Proper trailing comma handling supports dynamic object generation

## Technology Consultation Summary

### Libraries Consulted:

- Library: prettier | ID: /prettier/prettier | Version: 3.6.2
- Key Changes: Enhanced TypeScript support, improved configuration handling
- Best Practices: JSON configuration for simplicity, file-specific overrides for different formats
- Security Updates: No security concerns with current configuration

### Implementation Adjustments:

- Used JSON format instead of TypeScript config for broader compatibility
- Added comprehensive file-specific overrides for multi-format project
- Configured for TypeScript strict mode compatibility
- Optimized for Node.js 18+ target environment

## Usage

### CLI Usage

```bash
# Format all files
npx prettier --write .

# Check formatting
npx prettier --check .

# Format specific files
npx prettier --write "src/**/*.{ts,js,json,md}"
```

### Integration with Package Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

### Pre-commit Hook

The configuration works with git hooks to ensure consistent formatting:

```bash
# Install husky and lint-staged
npm install --save-dev husky lint-staged

# Configure in package.json
{
  "lint-staged": {
    "*.{ts,js,json,md,yaml,yml}": "prettier --write"
  }
}
```

## Compatibility

- **Node.js**: 18+ (project requirement)
- **TypeScript**: All versions with strict mode
- **Editors**: VS Code, WebStorm, Vim, Emacs
- **CI/CD**: GitHub Actions, GitLab CI, Jenkins

## Maintenance

This configuration should be reviewed when:

- Upgrading Prettier major versions
- Adding new file types to the project
- Changing TypeScript compiler options
- Integrating new development tools

For updates, consult the Context7 MCP server for latest Prettier best practices.
