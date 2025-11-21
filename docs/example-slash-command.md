---
allowed-tools: 
  - Edit
  - Bash(npm:*)
  - Bash(npx:*)
hints: |
  Generate comprehensive test suite for the specified file
---

# Generate Tests Command

You are tasked with generating tests for: $ARGUMENTS

## Process:
1. Read the target file and understand its exports
2. Identify all functions, classes, and edge cases
3. Create test file following project patterns
4. Run tests to verify they pass
5. Report coverage percentage

## Test Structure:
```typescript
import { describe, it, expect } from 'vitest';
import { functionName } from './source-file';

describe('functionName', () => {
  it('should handle happy path', () => {
    // Test implementation
  });
  
  it('should handle edge case', () => {
    // Test implementation
  });
});
```

## Execution Steps:
1. Read the source file using read_file tool
2. Create test file at `$ARGUMENTS.test.ts`
3. Run tests using verify_test tool
4. Report results and coverage

Begin by reading the file.
