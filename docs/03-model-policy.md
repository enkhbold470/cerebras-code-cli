# 03 — Model Policy

This step captures why the CLI is pinned to a single model and how that choice is enforced.

## Decision
- The assistant exclusively targets `qwen-3-235b-a22b-instruct-2507` served via the Cerebras API.
- Rationale:
  - Guarantees consistent latency (advertised up to 2600 tokens/sec) and behavior across environments.
  - Simplifies support/documentation because no feature permutations exist per model.
  - Keeps API usage aligned with the user’s request to “use only qwen-3-235b-a22b-instruct-2507.”

## Implementation details
- `src/config.ts` defines `const DEFAULT_MODEL = 'qwen-3-235b-a22b-instruct-2507'` and returns that value from `getCerebrasConfig()`.
- CLI flags and `.cerebrasrc` entries related to model selection have been removed, so runtime switching is impossible without code changes.
- Documentation updates (README, AGENTS) reiterate the constraint and point to `src/config.ts` if a fork truly needs a different backend.

## Operator guidance
1. Set the API key before running the CLI:
   ```bash
   export CEREBRAS_API_KEY="your-api-key"
   ```
2. Optional tuning variables:
   - `CEREBRAS_MAX_TOKENS` (default `4096`)
   - `CEREBRAS_TEMPERATURE` (default `0.7`)
   - `CEREBRAS_BASE_URL` (default `https://api.cerebras.ai/v1`)
3. If you must change the model for a fork, update the `DEFAULT_MODEL` constant and document the deviation in a new `docs/` entry.

Any future enhancements (e.g., per-command model overrides) must preserve a clearly documented policy; append additional sections here describing the behavior and reasoning.
