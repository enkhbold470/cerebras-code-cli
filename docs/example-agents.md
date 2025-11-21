# Example AGENTS.md Template

## Project Overview
Brief 2-3 sentence description of what this project does.

## Tech Stack
- Language: TypeScript 5.2
- Framework: Next.js 14 (App Router)
- State: Zustand 4.x
- Styling: Tailwind CSS + shadcn/ui
- Testing: Vitest + Playwright
- Database: PostgreSQL with Prisma ORM

## Project Structure
- `app/` - Next.js app router pages and layouts
- `components/` - Reusable UI components (use shadcn/ui patterns)
- `lib/` - Shared utilities and business logic
- `prisma/` - Database schema and migrations
- `tests/` - Unit and integration tests

Key entry points:
- See `app/layout.tsx` for global app structure
- See `lib/api/client.ts` for API interaction patterns
- See `components/ui/` for base design system

## Commands

### File-Scoped (Preferred)
```
# Type check single file
npx tsc --noEmit path/to/file.tsx

# Format single file  
npx prettier --write path/to/file.tsx

# Lint single file
npx eslint --fix path/to/file.tsx

# Run specific test
npx vitest run path/to/file.test.tsx
```

### Project-Wide (Use sparingly)
```
npm run build       # Full production build
npm run test:e2e    # End-to-end test suite
```

## Do's ✅
- Use functional components with hooks (no class components)
- Use TypeScript strict mode - all types must be explicit
- Follow React Server Components patterns for app router
- Use Zod for runtime validation
- Prefer composition over prop drilling
- Keep components under 200 lines
- Co-locate tests with implementation files
- Use design tokens from `lib/theme/tokens.ts`
- Write JSDoc comments for exported functions

## Don'ts ❌
- Don't use `any` type - use `unknown` and narrow
- Don't edit files in `app/legacy/` directory
- Don't install heavy dependencies without approval
- Don't hardcode API endpoints - use environment variables
- Don't bypass authentication checks
- Don't commit directly to `main` branch
- Don't use inline styles - use Tailwind classes
- Don't create new component libraries - use shadcn/ui

## Examples

### Good Component Pattern
```typescript
// components/UserProfile.tsx
interface UserProfileProps {
  userId: string;
  onUpdate?: (user: User) => void;
}

export function UserProfile({ userId, onUpdate }: UserProfileProps) {
  // Implementation using hooks, proper types, and composition
}
```

### Good API Pattern  
```typescript
// lib/api/users.ts
import { apiClient } from './client';

export async function fetchUser(id: string): Promise<User> {
  return apiClient.get<User>(`/users/${id}`);
}
```

### Bad Pattern (Avoid)
```typescript
// ❌ Class component
class UserProfile extends React.Component { }

// ❌ Any types
function process(data: any) { }

// ❌ Inline API calls in components
function UserProfile() {
  fetch('/api/users/123').then(...);
}
```

## Testing Guidelines
- Write tests for all new business logic
- Test user interactions, not implementation details
- Mock external APIs using MSW
- Use data-testid for E2E test selectors
- Aim for 80% coverage on core business logic

## Git Workflow
- Branch naming: `feature/description` or `fix/description`
- Commit format: `type(scope): message` (conventional commits)
- PR checklist: tests pass, linter clean, no console.logs
- Squash commits before merging

## API Documentation
See `docs/api/*.md` for endpoint documentation:
- `POST /api/auth/login` - User authentication
- `GET /api/users/:id` - Fetch user profile
- `PATCH /api/users/:id` - Update user data

## When Stuck
- Ask clarifying questions before making assumptions
- Propose a plan with 2-3 options
- Open draft PR with questions in comments
- Reference similar patterns in existing code
