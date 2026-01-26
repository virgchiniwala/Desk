# Desk Platform

**A job-first execution platform for long running knowledge work**

Desk is a minimal, secure platform for managing and executing long-running jobs with phase-based workflows. Built with simplicity and security as core principles.

## Architecture

Desk consists of two main components:

### 1. Ralph Kernel (Bash)
- **Filesystem-as-database**: All job state stored in `jobs/` directory
- **Phase-based execution**: RESEARCH → PLAN → IMPLEMENT → REVIEW → VERIFY → PACKAGE
- **Queue system**: Filesystem-based queue with worker process
- **Git-based audit trail**: Every phase execution creates a commit
- **Lock mechanism**: Prevents concurrent execution with TTL-based locks

### 2. Web UI (Node.js + Express)
- **AI Chat Interface**: Conversational interface for creating and managing jobs
- **Server-rendered**: EJS templates, no JSON API, no SPA
- **Cookie sessions**: express-session + SQLite (no JWT)
- **Multi-provider AI**: Supports Anthropic, OpenAI, Gemini, Ollama, Claude Code
- **Security-first**: Command injection prevention, path traversal protection
- **Desktop-only**: Minimal CSS, manual refresh, no auto-polling
- **Role-based access**: Officers and Supervisors

## Quick Start

### Prerequisites

- **Node.js** ≥ 18.0.0
- **Bash** (macOS/Linux)
- **GNU coreutils** (for `timeout`/`gtimeout`)
  ```bash
  # macOS
  brew install coreutils

  # Linux (usually pre-installed)
  apt-get install coreutils
  ```
- **AI Provider Account** (choose one):
  - [Anthropic](https://console.anthropic.com/) (Claude models)
  - [OpenAI](https://platform.openai.com/) (GPT models)
  - [Google AI Studio](https://makersuite.google.com/app/apikey) (Gemini models)
  - [Ollama](https://ollama.ai) (Local models, no account needed)

### Installation & Setup

#### 1. Clone and Install Dependencies

```bash
git clone https://github.com/virgchiniwala/Desk.git
cd Desk/server
npm install
```

#### 2. Configure AI Provider

Create `.env` file in the Desk root directory:

```bash
cd ..
cp .env.example .env
```

**Option A: Anthropic (Recommended)**
```bash
cat >> .env << 'EOF'
# AI Provider
DESK_AI_PROVIDER=anthropic
DESK_AI_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Session Security
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
NODE_ENV=development
PORT=3000
EOF
```

**Option B: OpenAI**
```bash
cat >> .env << 'EOF'
DESK_AI_PROVIDER=openai
DESK_AI_MODEL=gpt-4-turbo
OPENAI_API_KEY=sk-your-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
EOF
```

**Option C: Google Gemini (Free Tier Available!)**
```bash
cat >> .env << 'EOF'
DESK_AI_PROVIDER=gemini
DESK_AI_MODEL=gemini-pro
GOOGLE_API_KEY=AIza-your-key-here
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
EOF
```

**Option D: Ollama (Local, No API Key)**
```bash
# Install and start Ollama first
brew install ollama  # macOS
ollama pull llama2   # Download model

cat >> .env << 'EOF'
DESK_AI_PROVIDER=ollama
DESK_AI_MODEL=llama2
OLLAMA_BASE_URL=http://localhost:11434
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
EOF
```

#### 3. Test Provider Connection

```bash
cd server
node test-providers.js
```

Expected output:
```
🧪 Testing AI Provider Configuration

📋 Available Providers:
   - Anthropic (anthropic)
   - OpenAI (openai)
   - Google Gemini (gemini)
   - Ollama (ollama)
   - Claude Code (CLI) (claude-code)

🔧 Testing Instance Default Provider...
   Provider: anthropic
   Model: claude-sonnet-4-5-20250929
   Running healthcheck...
   ✅ Successfully connected to Anthropic API

   Testing message generation...
   Response: "Hello from Desk! I'm ready to help..."

✅ All tests passed!
```

#### 4. Start Desk

```bash
npm start
```

You should see:
```
============================================================
Desk AI Platform - Server Started
============================================================
🚀 Server running on http://localhost:3000
📂 Jobs directory: /Users/you/Desk/jobs
🗄️  Database: /Users/you/Desk/server/db/desk.db

🔧 Starting task worker...
✓ Worker started and monitoring for tasks

First-time setup: Visit /signup to create admin account
```

#### 5. Create Your Account

1. Visit **http://localhost:3000/signup**
2. Create admin account:
   - Username: your choice
   - Password: your choice
   - Role: Supervisor (for full access)

#### 6. Start Using Chat Interface

1. Login at **http://localhost:3000**
2. You'll be redirected to the **Chat interface** (`/chat`)
3. Start a conversation:
   ```
   You: "Help me analyze a dataset of customer feedback"

   AI: "I'll help you analyze customer feedback. Let me create a job
        for this task. What format is your data in?"
   ```
4. The AI will:
   - Interview you about requirements
   - Create a Ralph job (PROJECT-001)
   - Generate task plans with dependencies
   - Execute tasks through the Ralph worker
   - Deliver artifacts

### Using the Chat Interface

#### Chat Layout

```
┌─────────────────────────────────────────────────────────┐
│ Desk AI           [Model: ▼]  ⚙️  @username  [Logout]  │
├─────────┬──────────────────────────┬────────────────────┤
│ SIDEBAR │      CHAT AREA          │   TASK PANEL       │
│         │                          │                    │
│ + New   │  💬 Empty state or       │  📋 Tasks         │
│         │     conversation         │                    │
│ Convo 1 │                          │  PROJECT-001       │
│ Convo 2 │  [Type message...]       │  ├─ PLAN ✓        │
│ Convo 3 │  [📎] [Send]            │  ├─ IMPLEMENT ⏳   │
│         │                          │  └─ REVIEW ⏸      │
└─────────┴──────────────────────────┴────────────────────┘
```

#### Basic Workflow

1. **Describe your goal**: "I need to process CSV data"
2. **AI interviews you**: Asks clarifying questions
3. **AI creates plan**: Shows task breakdown
4. **Approve plan**: AI creates job via `create_job` tool
5. **Tasks execute**: Worker processes through Ralph
6. **Download artifacts**: Click links in task panel

#### Example Conversation

```
You: "I need to analyze sales data from Q4 2025"

AI: "I'll help you analyze Q4 2025 sales data. Let me ask a few
     questions to understand your needs:

     1. What format is your sales data in (CSV, Excel, database)?
     2. What kind of analysis are you looking for?
     3. Do you need visualizations or just summary statistics?"

You: "CSV format. I need revenue by region and top products.
      Visualizations would be helpful."

AI: "Perfect! Here's my plan:

     Phase 1 - RESEARCH:
     - Load and validate CSV data
     - Check for data quality issues

     Phase 2 - PLAN:
     - Design aggregation strategy
     - Plan visualization approach

     Phase 3 - IMPLEMENT:
     - Calculate revenue by region
     - Identify top products
     - Generate charts

     Should I proceed with creating this job?"

You: "Yes, go ahead"

AI: [Creates job PROJECT-001 using create_job tool]

    "Job PROJECT-001 created! I'm now executing the phases.
     You can track progress in the task panel on the right."
```

### Advanced: User Model Overrides

Allow users to configure their own AI providers:

#### 1. Enable User Overrides

Add to `.env`:
```bash
DESK_ALLOW_USER_MODEL_OVERRIDES=true

# Required: Generate encryption key for user API keys
DESK_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

#### 2. Configure Personal Provider

1. Login and click **⚙️** settings icon (top right)
2. Go to **Model Settings** (`/settings/models`)
3. See **Instance Default** (read-only)
4. Configure **Your Custom Provider**:
   - Select provider (OpenAI, Gemini, etc.)
   - Enter API key
   - Click **Test Connection**
   - Click **Save Configuration**

#### 3. Select Provider in Chat

After configuring:
- **Model:** dropdown appears in chat header
- Switch between:
  - **Default** (instance provider from `.env`)
  - **Your provider** (personal configuration)
- Selection persists per conversation

**Security Notes:**
- User API keys encrypted at rest (AES-256-GCM)
- Encryption key stored in environment variable
- Changing `DESK_ENCRYPTION_KEY` invalidates all stored keys

## Ralph Kernel CLI

### Create a Job
```bash
./ralph/new-job.sh PROJECT-001 "Job description"
```

Creates job structure:
```
jobs/PROJECT-001/
  ├── inputs/          # Place input files here
  ├── output/          # Generated artifacts
  ├── tmp/             # Logs and temp files
  ├── meta.json        # Job metadata
  ├── plan.md          # Execution plan
  ├── progress.md      # Progress log
  └── session-handoff.md  # Session continuity notes
```

### Enqueue a Phase
```bash
./ralph/enqueue.sh PROJECT-001 PLAN \
  --exec "echo 'Planning complete'" \
  --time-min 30
```

Options:
- `--exec "CMD"` - Command to execute (required)
- `--time-min N` - Time budget in minutes (default: 30)
- `--retries N` - Max retry attempts (default: 0)
- `--checkpointable` - Allow re-enqueue on timeout

### Run Worker
```bash
./ralph/worker.sh
# Or with options:
./ralph/worker.sh --loop-sleep 5 --lock-ttl-hours 2
```

The worker:
- Scans queue every N seconds (default: 10)
- Acquires locks to prevent concurrent execution
- Executes jobs via `ralph/run.sh`
- Updates status to NEEDS_REVIEW on failure
- Creates checkpoint commits

### Unlock a Stuck Job
```bash
./ralph/unlock-job.sh PROJECT-001
```

Removes stale lock file after confirmation.

## Web UI Features

### AI Chat Interface (`/chat`)
- **Conversational job creation**: Describe goals in natural language
- **AI interviewing**: AI asks clarifying questions
- **Task dependency graphs**: AI creates structured task plans
- **Real-time task monitoring**: See task execution in right panel
- **Multi-conversation**: Switch between different projects
- **Artifact downloads**: Click to download job outputs
- **Model selection**: Choose AI provider per conversation (if enabled)

### Settings Interface (`/settings/models`)
- **Provider configuration**: Connect personal AI providers
- **Test connection**: Verify API keys before saving
- **Encrypted storage**: API keys encrypted at rest
- **Instance defaults**: View but not change instance configuration

### Legacy Job Management (`/jobs`)
- **Create Jobs**: Web form with PROJECT-NNN validation
- **View Jobs**: Sortable table with status, phase, date
- **Job Detail**: Metadata, progress log, output files
- **Trigger Phases**: Enqueue phases via web form
- **View Logs**: Real-time worker logs
- **Download Artifacts**: Stream files from job output directory

### Authentication
- **Cookie-based sessions**: 24-hour expiry
- **bcrypt password hashing**: 10 rounds
- **Role-based access**: Officer and Supervisor roles
- **First-time signup**: `/signup` for admin account creation

### Security Features
- **Command injection prevention**: `spawn()` with `shell: false`
- **Path traversal protection**: Job ID validation + path normalization
- **Session security**: httpOnly cookies, HTTPS in production
- **Helmet security headers**: CSP, XSS protection
- **Input validation**: Forms validate before submission

## User Management

### Create a New User
```bash
cd server
npm run create-user
# Follow prompts for username, password, role
```

Roles:
- **Officer**: Access to jobs (future: own jobs only)
- **Supervisor**: Access to all jobs

## Project Structure

```
Desk/
├── ralph/                    # Ralph kernel (Bash scripts)
│   ├── new-job.sh           # Create job directory
│   ├── enqueue.sh           # Add job to queue
│   ├── worker.sh            # Background worker
│   ├── run.sh               # Execute job phase
│   ├── unlock-job.sh        # Remove stale locks
│   └── queue/               # Filesystem queue
│       ├── pending/         # Jobs waiting to execute
│       ├── processing/      # Currently executing
│       ├── completed/       # Successfully completed
│       └── failed/          # Failed execution
├── jobs/                     # Job directories (auto-created)
│   └── PROJECT-001/         # Example job
├── server/                   # Web UI (Node.js)
│   ├── server.js            # Express app
│   ├── routes/              # HTTP routes
│   │   ├── chat.js          # AI chat interface
│   │   ├── settings.js      # Model settings
│   │   ├── api.js           # REST API
│   │   ├── jobs.js          # Legacy job UI
│   │   └── auth.js          # Authentication
│   ├── views/               # EJS templates
│   │   ├── chat.ejs         # Chat interface
│   │   ├── settings-models.ejs  # Provider settings
│   │   └── ...              # Other views
│   ├── middleware/          # Auth middleware
│   ├── lib/                 # Libraries
│   │   ├── ai/              # AI provider system
│   │   │   ├── providers/   # Provider implementations
│   │   │   │   ├── base.js      # Base interface
│   │   │   │   ├── anthropic.js # Claude models
│   │   │   │   ├── openai.js    # GPT models
│   │   │   │   ├── gemini.js    # Gemini models
│   │   │   │   ├── ollama.js    # Local models
│   │   │   │   └── claude-code.js # CLI provider
│   │   │   └── provider-manager.js # Provider selection
│   │   ├── ai-agent.js      # Conversational agent
│   │   ├── task-graph.js    # Task dependencies
│   │   ├── worker-manager.js # Background worker
│   │   ├── crypto.js        # Encryption utilities
│   │   ├── shell-runner.js  # Safe shell execution
│   │   └── job-reader.js    # Filesystem helpers
│   ├── db/                  # SQLite database
│   │   ├── migrations/      # Schema migrations
│   │   │   ├── 001_initial_schema.sql
│   │   │   └── 002_add_multi_provider_support.sql
│   │   ├── init.sql         # Schema
│   │   └── db.js            # Connection
│   ├── test-providers.js    # Provider connectivity test
│   └── public/              # Static assets
├── vault/                    # Knowledge management (PARA)
│   ├── CLAUDE.md            # Vault operating contract
│   ├── 01_Inbox/            # Unprocessed notes
│   ├── 02_Projects/         # Active initiatives
│   ├── 03_Areas/            # Ongoing responsibilities
│   ├── 04_Knowledge/        # Reusable knowledge
│   └── 05_Archive/          # Historical records
├── AGENTS.md                 # Agent execution contract
└── .env                      # Environment config (not in repo)
```

## Job Lifecycle

```
1. CREATE    → Job directory created (new-job.sh)
2. ENQUEUE   → Phase added to queue (enqueue.sh)
3. ACQUIRE   → Worker acquires lock
4. EXECUTE   → Worker runs phase via run.sh
5. VALIDATE  → Postflight checks unauthorized writes
6. COMMIT    → Git checkpoint commit
7. RELEASE   → Worker releases lock
8. STATUS    → Job status updated (COMPLETED or NEEDS_REVIEW)
```

## Job Phases

| Phase | Purpose | Example Command |
|-------|---------|----------------|
| **RESEARCH** | Gather information | `curl https://api.example.com/data` |
| **PLAN** | Define approach | `cat inputs/requirements.txt` |
| **IMPLEMENT** | Execute work | `python scripts/process.py` |
| **REVIEW** | Validate output | `diff expected.txt output/result.txt` |
| **VERIFY** | Final checks | `bash scripts/verify.sh` |
| **PACKAGE** | Prepare deliverables | `tar -czf output/delivery.tar.gz output/` |

## Security Considerations

### Command Injection Prevention
```javascript
// ❌ NEVER: String interpolation with shell: true
exec(`ls ${userInput}`)  // Vulnerable!

// ✅ ALWAYS: spawn() with argv array and shell: false
spawn('ls', [userInput], { shell: false })  // Safe
```

### Path Traversal Prevention
```javascript
// Job ID validation (PROJECT-NNN format)
if (!/^[A-Z]+-[0-9]{3}$/.test(jobId)) {
  throw new Error('Invalid job ID');
}

// Path normalization and boundary check
const safePath = path.resolve(jobPath, userPath);
if (!safePath.startsWith(jobPath + path.sep)) {
  throw new Error('Path traversal detected');
}
```

### Write Path Enforcement
Jobs have explicit allowed write paths in `meta.json`:
```json
{
  "jobId": "PROJECT-001",
  "elevated": false,
  "allowedPaths": ["jobs/PROJECT-001/"]
}
```

Non-elevated jobs cannot write outside their directory.

## Configuration

### Environment Variables (.env)
```bash
# Server port
PORT=3000

# Session secret (CHANGE IN PRODUCTION!)
SESSION_SECRET=generate-random-64-char-hex-string

# Node environment
NODE_ENV=development  # or 'production'
```

### AI Provider Configuration

Desk supports multiple AI providers with flexible instance-level and user-level configuration.

#### Instance Default Provider

Set the default provider for your Desk instance in `.env`:

```bash
# Provider selection (anthropic | openai | ollama | claude-code | gemini)
DESK_AI_PROVIDER=anthropic

# Model selection (provider-specific)
DESK_AI_MODEL=claude-sonnet-4-5-20250929

# API keys for providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
```

#### Supported Providers

| Provider | Models | API Key Required | Local |
|----------|--------|-----------------|-------|
| **Anthropic** | Claude Sonnet 4.5, Claude Opus 4.5, etc. | Yes | No |
| **OpenAI** | GPT-4, GPT-3.5, O1, etc. | Yes | No |
| **Gemini** | Gemini Pro, Gemini 1.5 Pro/Flash | Yes | No |
| **Ollama** | Llama, Mistral, Code Llama, etc. | No | Yes |
| **Claude Code** | Via CLI | Anthropic account | No |

#### Anthropic Setup
```bash
DESK_AI_PROVIDER=anthropic
DESK_AI_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=sk-ant-...
```

Get your API key: https://console.anthropic.com/

#### OpenAI Setup
```bash
DESK_AI_PROVIDER=openai
DESK_AI_MODEL=gpt-4-turbo
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1  # Optional
```

Get your API key: https://platform.openai.com/api-keys

**Azure OpenAI**: Set custom `OPENAI_BASE_URL`:
```bash
OPENAI_BASE_URL=https://your-resource.openai.azure.com/openai/deployments/your-deployment
```

#### Google Gemini Setup
```bash
DESK_AI_PROVIDER=gemini
DESK_AI_MODEL=gemini-pro
GOOGLE_API_KEY=AIza...
```

Get your API key: https://makersuite.google.com/app/apikey

#### Ollama Setup (Local Models)
```bash
DESK_AI_PROVIDER=ollama
DESK_AI_MODEL=llama2
OLLAMA_BASE_URL=http://localhost:11434
```

Install Ollama: https://ollama.ai

Then pull models:
```bash
ollama pull llama2
ollama pull mistral
ollama pull codellama
```

#### Claude Code CLI Setup
```bash
DESK_AI_PROVIDER=claude-code
CLAUDE_CODE_PATH=claude
CLAUDE_CODE_ARGS=--model sonnet  # Optional
```

Requires Claude Code CLI: https://claude.com/claude-code

### User Model Overrides

Allow users to configure their own AI providers:

```bash
# Enable user-level provider configuration
DESK_ALLOW_USER_MODEL_OVERRIDES=true

# Required: 64-character hex string for encrypting user API keys
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
DESK_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
```

When enabled:
1. Users can visit `/settings/models` to configure their own provider
2. API keys are encrypted at rest using `DESK_ENCRYPTION_KEY`
3. Users can select between instance default or their custom provider in chat
4. Each conversation remembers the provider selection

**Security Notes:**
- `DESK_ENCRYPTION_KEY` must be 32 bytes (64 hex characters)
- Store encryption key securely (environment variable, secrets manager)
- Changing encryption key invalidates all stored user API keys
- If key is missing, user configurations cannot be saved

### Database
- **SQLite** database at `server/db/desk.db`
- **Schema**: Users + Sessions + User Model Configs tables
- **Sessions**: Managed by connect-sqlite3
- **Backups**: Copy `desk.db` file

## Development

### Run in Development Mode
```bash
cd server
npm run dev  # Uses node --watch for auto-reload
```

### Run Security Tests
```bash
cd server
node test-security.js
```

Tests:
- Command injection prevention
- Path traversal protection
- Job ID validation
- File path validation

### Project Conventions
- **Bash scripts**: Set errexit (`set -euo pipefail`)
- **Job IDs**: `PROJECT-NNN` format (uppercase, 3 digits)
- **Commit messages**: Conventional commits (`feat:`, `fix:`, `docs:`)
- **No emojis**: Unless explicitly requested
- **Server-rendered**: No client-side JavaScript frameworks

## Troubleshooting

### Worker Won't Start
```bash
# Check if timeout/gtimeout is installed
command -v timeout || command -v gtimeout

# Install coreutils if missing
brew install coreutils  # macOS
```

### Job Stuck with Lock
```bash
# Remove stale lock
./ralph/unlock-job.sh PROJECT-001

# Check lock age in jobs/PROJECT-001/tmp/worker.lock
```

### Database Issues
```bash
# Reset database (WARNING: Deletes all users/sessions)
cd server
rm db/desk.db db/desk.db-*
npm start  # Recreates with default admin user
```

### Server Won't Start
```bash
# Check port availability
lsof -i :3000

# Kill existing process
kill $(lsof -t -i :3000)

# Check logs for errors
cd server
npm start
```

## Design Principles

1. **Filesystem as database**: All state in `jobs/` directory
2. **Git as audit trail**: Every phase creates a commit
3. **Server-rendered over SPA**: Simplicity and security
4. **Cookie sessions over JWT**: Rails-style authentication
5. **Manual refresh over polling**: Explicit user action
6. **Desktop-only**: No mobile/responsive complexity
7. **Security by default**: Input validation, safe execution

## Implementation Notes

### Why Server-Rendered?
- **Simpler**: No JSON API, no frontend build step
- **Faster**: No client-side hydration, immediate interactivity
- **More secure**: No CORS, no client-side secrets
- **Rails-inspired**: Proven pattern for CRUD apps

### Why Filesystem Queue?
- **No dependencies**: No Redis, Kafka, or RabbitMQ
- **Observable**: Queue state visible in `ralph/queue/`
- **Git-friendly**: Queue items are tracked files
- **Atomic operations**: Filesystem moves are atomic

### Why Bash for Kernel?
- **Universal**: Runs anywhere with Bash
- **Simple**: No runtime dependencies
- **Transparent**: Easy to read and debug
- **Composable**: Standard Unix tools

## Contributing

### Before Submitting PR
1. Run security tests: `node server/test-security.js`
2. Test happy path: Create job → Enqueue phase → View logs
3. Check commit messages follow conventional format
4. Ensure no secrets in code (use .env)

### Code Review Checklist
- [ ] No command injection vulnerabilities
- [ ] No path traversal vulnerabilities
- [ ] Input validation on all forms
- [ ] Passwords never logged or exposed
- [ ] Session secrets in .env, not code
- [ ] Git commits are checkpoint-style

## License

See LICENSE file.

## Credits

Built with:
- **Express** - Web framework
- **EJS** - Template engine
- **better-sqlite3** - SQLite database
- **bcryptjs** - Password hashing
- **helmet** - Security headers
- **@anthropic-ai/sdk** - Claude API client
- **openai** - OpenAI/Azure API client
- **@google/generative-ai** - Gemini API client
- **multer** - File upload handling
- **express-rate-limit** - API rate limiting

Design influenced by:
- **Rails** - Server-rendered conventions
- **PARA** - Knowledge management system
- **Unix philosophy** - Small, composable tools
- **Provider pattern** - Pluggable AI backends

---

🤖 Implementation assisted by [Claude Code](https://claude.com/claude-code)
