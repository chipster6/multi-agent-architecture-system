# ESLint Setup Guide

## Installation

The project has been configured with modern ESLint flat config. To install dependencies:

```bash
# Install all dependencies including ESLint
npm install

# Or install ESLint dependencies specifically
npm install --save-dev eslint@^9.37.0 typescript-eslint@^8.0.0 @eslint/js@^9.37.0 globals@^15.0.0
```

## Configuration Files

- **`eslint.config.js`**: Main ESLint configuration using flat config format
- **`docs/eslint-configuration.md`**: Detailed documentation of rules and rationale

## Usage

### Command Line

```bash
# Lint all TypeScript files
npm run lint

# Fix auto-fixable issues
npm run lint:fix

# Type checking (separate process)
npm run type-check
```

### IDE Setup

#### VS Code

1. Install the ESLint extension
2. The extension automatically detects `eslint.config.js`
3. Enable auto-fix on save in settings:

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

#### WebStorm/IntelliJ

1. ESLint is enabled by default
2. Go to Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint
3. Ensure "Automatic ESLint configuration" is selected

## File Structure

The configuration applies different rules to different file types:

```
src/**/*.ts          # Main application code (strict rules)
tests/**/*.ts        # Test files (relaxed rules)
*.config.{js,ts}     # Configuration files (build-focused rules)
```

## Key Features

- **Type-aware linting**: Uses TypeScript compiler for advanced checks
- **Production-ready rules**: Strict error handling and type safety
- **Performance optimized**: Uses `projectService` for faster linting
- **Test-friendly**: Relaxed rules for test files
- **Modern standards**: ESLint v9 flat config with latest best practices

## Troubleshooting

### Common Issues

1. **"Cannot find module 'typescript-eslint'"**

   ```bash
   npm install typescript-eslint@^8.0.0
   ```

2. **"Parsing error: Cannot read file"**
   - Check that `tsconfig.json` exists and is valid
   - Ensure file is included in TypeScript project

3. **Performance issues**
   - The configuration uses `projectService` for optimal performance
   - Large projects may need additional optimization

### Getting Help

- Check the [ESLint documentation](https://eslint.org/docs/latest/)
- Review [TypeScript ESLint documentation](https://typescript-eslint.io/)
- See `docs/eslint-configuration.md` for detailed rule explanations

## Migration Notes

This project has been migrated from legacy ESLint configuration (`.eslintrc.json`) to the modern flat config format (`eslint.config.js`). The new configuration provides:

- Better performance with `projectService`
- More reliable module resolution
- Cleaner configuration syntax
- Enhanced TypeScript integration
- Future-proof setup aligned with ESLint roadmap
