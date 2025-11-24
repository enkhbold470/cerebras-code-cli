# Cerebras CLI

A conversational AI CLI tool powered by Cerebras with intelligent text editor capabilities and tool usage.

## Features

- **🤖 Conversational AI**: Natural language interface powered by Cerebras
- **📝 Smart File Operations**: AI automatically uses tools to view, create, and edit files
- **⚡ Bash Integration**: Execute shell commands through natural conversation
- **🔧 Automatic Tool Selection**: AI intelligently chooses the right tools for your requests
- **🚀 Morph Fast Apply**: Optional high-speed code editing at 4,500+ tokens/sec with 98% accuracy
- **🔌 MCP Tools**: Extend capabilities with Model Context Protocol servers (Linear, GitHub, etc.)
- **💬 Interactive UI**: Beautiful terminal interface built with Ink
- **🌍 Global Installation**: Install and use anywhere with `bun add -g @enkhbold470/cerebras-cli`

## Installation

### Prerequisites
- Bun 1.0+ (or Node.js 18+ as fallback)
- Cerebras API key
- (Optional, Recommended) Morph API key for Fast Apply editing

### Global Installation (Recommended)
```bash
bun add -g @enkhbold470/cerebras-cli
```

Or with npm (fallback):
```bash
npm install -g @enkhbold470/cerebras-cli
```

### Local Development
```bash
git clone <repository>
cd cerebras-cli
bun install
bun run build
bun link
```

## Setup

1. Get your Cerebras API key from [Cerebras Cloud](https://cloud.cerebras.ai)

2. Set up your API key (choose one method):

**Method 1: Environment Variable**
```bash
export CEREBRAS_API_KEY="your-api-key"
```

**Method 2: .env File**
```bash
cp .env.example .env
# Edit .env and add your API key
CEREBRAS_API_KEY="your-api-key"
```

**Method 3: Command Line Flag**
```bash
ccode --api-key your-api-key
```

**Method 4: User Settings File**
Create `~/.cerebras/user-settings.json`:
```json
{
  "apiKey": "your-api-key"
}
```

3. (Optional, Recommended) Get your Morph API key from [Morph Dashboard](https://morphllm.com/dashboard/api-keys)

4. Set up your Morph API key for Fast Apply editing (choose one method):

**Method 1: Environment Variable**
```bash
export MORPH_API_KEY=your_morph_api_key_here
```

**Method 2: .env File**
```bash
# Add to your .env file
MORPH_API_KEY=your_morph_api_key_here
```

### Custom Base URL (Optional)

By default, the CLI uses `https://api.cerebras.ai/v1` as the Cerebras API endpoint. You can configure a custom endpoint if needed (choose one method):

**Method 1: Environment Variable**
```bash
export CEREBRAS_BASE_URL="https://api.cerebras.ai/v1"
```

**Method 2: Command Line Flag**
```bash
ccode --api-key your-api-key --base-url https://api.cerebras.ai/v1
```

**Method 3: User Settings File**
Add to `~/.cerebras/user-settings.json`:
```json
{
  "apiKey": "your-api-key",
  "baseURL": "https://api.cerebras.ai/v1"
}
```

## Configuration Files

Cerebras CLI uses two types of configuration files to manage settings:

### User-Level Settings (`~/.cerebras/user-settings.json`)

This file stores **global settings** that apply across all projects. These settings rarely change and include:

- **API Key**: Your Cerebras API key
- **Base URL**: Custom API endpoint (if needed)
- **Default Model**: Your preferred model
- **Available Models**: List of models you can use

**Example:**
```json
{
  "apiKey": "your-api-key",
  "baseURL": "https://api.cerebras.ai/v1",
  "defaultModel": "llama-3.3-70b",
  "models": [
    "llama-3.3-70b",
    "llama3.1-8b",
    "qwen-3-32b",
    "qwen-3-235b-a22b-instruct",
    "gpt-oss-120b"
  ]
}
```

### Project-Level Settings (`.cerebras/settings.json`)

This file stores **project-specific settings** in your current working directory. It includes:

- **Current Model**: The model currently in use for this project
- **MCP Servers**: Model Context Protocol server configurations

**Example:**
```json
{
  "model": "llama-3.3-70b",
  "mcpServers": {
    "linear": {
      "name": "linear",
      "transport": "stdio",
      "command": "npx",
      "args": ["@linear/mcp-server"]
    }
  }
}
```

### How It Works

1. **Global Defaults**: User-level settings provide your default preferences
2. **Project Override**: Project-level settings override defaults for specific projects
3. **Directory-Specific**: When you change directories, project settings are loaded automatically
4. **Fallback Logic**: Project model → User default model → System default

This means you can have different models for different projects while maintaining consistent global settings like your API key.

## Available Cerebras Models

Cerebras CLI supports the following models optimized for different use cases:

| Model | Context Window | Speed (t/s) | Best For |
|-------|----------------|-------------|----------|
| **llama-3.3-70b** | 64K (free), 128K (paid) | ~2,100 | General coding, fast responses (default) |
| **llama3.1-8b** | 8K (free), 128K (paid) | ~2,600+ | Lightweight tasks, autocomplete |
| **qwen-3-32b** | 40K | ~1,400 | Balanced performance |
| **qwen-3-235b-a22b-instruct** | 64K (free), 131K (paid) | ~1,400 | Large context, codebase analysis |
| **gpt-oss-120b** | Standard | ~3,000 | Complex reasoning, architecture |

### Rate Limits (Free Tier)

| Model | TPM | TPH | TPD | RPM | RPH | RPD |
|-------|-----|-----|-----|-----|-----|-----|
| `llama-3.3-70b` | 60K | 1M | 1M | 30 | 900 | 14.4K |
| `llama3.1-8b` | 60K | 1M | 1M | 30 | 900 | 14.4K |
| `qwen-3-32b` | 60K | 1M | 1M | 30 | 900 | 14.4K |
| `qwen-3-235b` | 60K | 1M | 1M | 30 | 900 | 14.4K |
| `gpt-oss-120b` | 60K | 1M | 1M | 30 | 900 | 14.4K |

**Developer Tier (Paid):**
- **10x higher limits** than free tier
- Up to **1.5M TPM** on Max plan ($200/month)
- Self-serve starting at $10

**Legend:** TPM = Tokens Per Minute, TPH = Tokens Per Hour, TPD = Tokens Per Day, RPM = Requests Per Minute, RPH = Requests Per Hour, RPD = Requests Per Day

## Usage

### Interactive Mode

Start the conversational AI assistant:
```bash
ccode
```

Or specify a working directory:
```bash
ccode -d /path/to/project
```

### Headless Mode

Process a single prompt and exit (useful for scripting and automation):
```bash
ccode --prompt "show me the package.json file"
ccode -p "create a new file called example.js with a hello world function"
ccode --prompt "run bun test and show me the results" --directory /path/to/project
ccode --prompt "complex task" --max-tool-rounds 50  # Limit tool usage for faster execution
```

**Examples:**
```bash
ccode -p "explain async/await in JavaScript"
ccode -p "review the code in src/index.ts"
ccode -p "create a React component for a todo list"
```

This mode is particularly useful for:
- **CI/CD pipelines**: Automate code analysis and file operations
- **Scripting**: Integrate AI assistance into shell scripts
- **Terminal benchmarks**: Perfect for tools like Terminal Bench that need non-interactive execution
- **Batch processing**: Process multiple prompts programmatically

### Tool Execution Control

By default, Cerebras CLI allows up to 400 tool execution rounds to handle complex multi-step tasks. You can control this behavior:

```bash
# Limit tool rounds for faster execution on simple tasks
ccode --max-tool-rounds 10 --prompt "show me the current directory"

# Increase limit for very complex tasks (use with caution)
ccode --max-tool-rounds 1000 --prompt "comprehensive code refactoring"

# Works with all modes
ccode --max-tool-rounds 20  # Interactive mode
ccode git commit-and-push --max-tool-rounds 30  # Git commands
```

**Use Cases**:
- **Fast responses**: Lower limits (10-50) for simple queries
- **Complex automation**: Higher limits (500+) for comprehensive tasks
- **Resource control**: Prevent runaway executions in automated environments

### Model Selection

You can specify which AI model to use with the `--model` parameter or `CEREBRAS_MODEL` environment variable:

**Method 1: Command Line Flag**
```bash
# Use Cerebras models (recommended)
ccode --model llama-3.3-70b          # Default: Fast, general purpose
ccode --model llama3.1-8b             # Lightweight, fastest
ccode --model qwen-3-32b              # Balanced performance
ccode --model qwen-3-235b-a22b-instruct  # Large context (131K tokens)
ccode --model gpt-oss-120b            # Complex reasoning
```

**Method 2: Environment Variable**
```bash
export CEREBRAS_MODEL="llama-3.3-70b"
ccode
```

**Method 3: User Settings File**
Add to `~/.cerebras/user-settings.json`:
```json
{
  "apiKey": "your-api-key",
  "defaultModel": "llama-3.3-70b"
}
```

**Model Priority**: `--model` flag > `CEREBRAS_MODEL` environment variable > user default model > system default (`llama-3.3-70b`)

### Model Selection Strategy

Choose the right model for your task:

- **Fast iteration / autocomplete**: `llama3.1-8b` (~2,600 t/s)
- **General coding tasks**: `llama-3.3-70b` (~2,100 t/s) - **Recommended default**
- **Large codebase analysis**: `qwen-3-235b-a22b-instruct` (131K context)
- **Complex reasoning**: `gpt-oss-120b` (~3,000 t/s)

### Command Line Options

```bash
ccode [options]

Options:
  -V, --version          output the version number
  -d, --directory <dir>  set working directory
  -k, --api-key <key>    Cerebras API key (or set CEREBRAS_API_KEY env var)
  -u, --base-url <url>   Cerebras API base URL (or set CEREBRAS_BASE_URL env var)
  -m, --model <model>    AI model to use (or set CEREBRAS_MODEL env var)
  -p, --prompt <prompt>  process a single prompt and exit (headless mode)
  --max-tool-rounds <rounds>  maximum number of tool execution rounds (default: 400)
  -h, --help             display help for command
```

### Custom Instructions

You can provide custom instructions to tailor Cerebras's behavior to your project by creating a `.cerebras/CEREBRAS.md` file in your project directory:

```bash
mkdir .cerebras
```

Create `.cerebras/CEREBRAS.md` with your custom instructions:
```markdown
# Custom Instructions for Cerebras CLI

Always use TypeScript for any new code files.
When creating React components, use functional components with hooks.
Prefer const assertions and explicit typing over inference where it improves clarity.
Always add JSDoc comments for public functions and interfaces.
Follow the existing code style and patterns in this project.
```

Cerebras will automatically load and follow these instructions when working in your project directory. The custom instructions are added to Cerebras's system prompt and take priority over default behavior.

### Token Limits & Context Management

Cerebras models support large context windows:

- **Free tier**: Up to 64K tokens (llama-3.3-70b, qwen-3-235b)
- **Paid tier**: Up to 131K tokens (qwen-3-235b-a22b-instruct)
- **Lightweight**: 8K tokens (llama3.1-8b free tier)

The CLI automatically manages context windows and will truncate if needed. For large codebases, use `qwen-3-235b-a22b-instruct` with its 131K context window.

## Morph Fast Apply (Optional)

Cerebras CLI supports Morph's Fast Apply model for high-speed code editing at **4,500+ tokens/sec with 98% accuracy**. This is an optional feature that provides lightning-fast file editing capabilities.

**Setup**: Configure your Morph API key following the [setup instructions](#setup) above.

### How It Works

When `MORPH_API_KEY` is configured:
- **`edit_file` tool becomes available** alongside the standard `str_replace_editor`
- **Optimized for complex edits**: Use for multi-line changes, refactoring, and large modifications
- **Intelligent editing**: Uses abbreviated edit format with `// ... existing code ...` comments
- **Fallback support**: Standard tools remain available if Morph is unavailable

**When to use each tool:**
- **`edit_file`** (Morph): Complex edits, refactoring, multi-line changes
- **`str_replace_editor`**: Simple text replacements, single-line edits

### Example Usage

With Morph Fast Apply configured, you can request complex code changes:

```bash
ccode --prompt "refactor this function to use async/await and add error handling"
ccode -p "convert this class to TypeScript and add proper type annotations"
```

The AI will automatically choose between `edit_file` (Morph) for complex changes or `str_replace_editor` for simple replacements.

## MCP Tools

Cerebras CLI supports MCP (Model Context Protocol) servers, allowing you to extend the AI assistant with additional tools and capabilities.

### Adding MCP Tools

#### Add a custom MCP server:
```bash
# Add an stdio-based MCP server
ccode mcp add my-server --transport stdio --command "bun" --args server.js

# Add an HTTP-based MCP server
ccode mcp add my-server --transport http --url "http://localhost:3000"

# Add with environment variables
ccode mcp add my-server --transport stdio --command "python" --args "-m" "my_mcp_server" --env "API_KEY=your_key"
```

#### Add from JSON configuration:
```bash
ccode mcp add-json my-server '{"command": "bun", "args": ["server.js"], "env": {"API_KEY": "your_key"}}'
```

### Linear Integration Example

To add Linear MCP tools for project management:

```bash
# Add Linear MCP server
ccode mcp add linear --transport sse --url "https://mcp.linear.app/sse"
```

This enables Linear tools like:
- Create and manage Linear issues
- Search and filter issues
- Update issue status and assignees
- Access team and project information

### Managing MCP Servers

```bash
# List all configured servers
ccode mcp list

# Test server connection
ccode mcp test server-name

# Remove a server
ccode mcp remove server-name
```

### Available Transport Types

- **stdio**: Run MCP server as a subprocess (most common)
- **http**: Connect to HTTP-based MCP server
- **sse**: Connect via Server-Sent Events

## Development

```bash
# Install dependencies
bun install

# Development mode
bun run dev

# Build project
bun run build

# Run linter
bun run lint

# Type check
bun run typecheck
```

## Architecture

- **Agent**: Core command processing and execution logic
- **Tools**: Text editor and bash tool implementations
- **UI**: Ink-based terminal interface components
- **Types**: TypeScript definitions for the entire system

## Resources

- **API Documentation**: https://inference-docs.cerebras.ai
- **Cerebras Cloud**: https://cloud.cerebras.ai
- **Playground**: https://cloud.cerebras.ai/playground
- **Pricing**: https://www.cerebras.ai/pricing

## Key Advantages

- **Speed**: 20-70x faster than GPUs - instant responses (2,100+ tokens/sec)
- **Cost**: Up to 70% cheaper than closed-source models
- **Context**: Up to 131K tokens for large codebases
- **Compatibility**: OpenAI-compatible API (drop-in replacement)
- **Reliability**: Continuous token replenishment (no burst limits)

## License

MIT
