/**
 * Chat Client - Real-time SSE updates and task visualization
 * XSS-safe: Uses textContent and DOM methods instead of innerHTML
 */

class ChatClient {
  constructor(conversationId, jobs) {
    this.conversationId = conversationId;
    this.jobs = jobs || [];
    this.eventSource = null;
    this.uploadedFiles = new Map();
    this.deckPlan = null;

    this.init();
  }

  init() {
    // Setup event listeners
    this.setupFormHandlers();
    this.setupFileUpload();
    this.setupDeckWorkflow();

    // Connect to SSE stream
    this.connectSSE();

    // Load task graphs for each job
    this.loadTaskGraphs();

    // Load artifacts for each job
    this.loadArtifacts();

    // Auto-scroll messages
    this.scrollToBottom();
    this.refreshDeckReadiness();
  }

  // ========================================
  // SSE Connection
  // ========================================

  connectSSE() {
    console.log(`[SSE] Connecting to /chat/${this.conversationId}/stream`);

    this.eventSource = new EventSource(`/chat/${this.conversationId}/stream`);

    this.eventSource.onopen = () => {
      console.log('[SSE] Connected');
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleSSEEvent(data);
      } catch (error) {
        console.error('[SSE] Failed to parse event:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('[SSE] Connection error:', error);

      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        console.log('[SSE] Reconnecting...');
        this.eventSource.close();
        this.connectSSE();
      }, 5000);
    };
  }

  handleSSEEvent(data) {
    console.log('[SSE] Event:', data);

    switch (data.type) {
      case 'connected':
        console.log('[SSE] Connection confirmed');
        break;

      case 'message_chunk':
        this.appendAssistantChunk(data.chunk);
        break;

      case 'message_complete':
        this.finalizeAssistantMessage(data.messageId);
        break;

      case 'task_update':
        this.updateTaskStatus(data.taskId, data.status, data.jobId);
        break;

      case 'artifact_ready':
        this.addArtifact(data.jobId, data.filename, data.size, data.path);
        break;

      case 'job_created':
        this.addJobCard(data.jobId);
        break;

      default:
        console.warn('[SSE] Unknown event type:', data.type);
    }
  }

  // ========================================
  // Message Handling
  // ========================================

  setupFormHandlers() {
    const form = document.getElementById('chatForm');
    const input = document.getElementById('messageInput');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const message = input.value.trim();
      if (!message) return;

      // Clear input immediately
      input.value = '';

      // Add user message to UI
      this.addMessage('user', message);

      // Send to server
      await this.sendMessage(message);
    });

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = input.scrollHeight + 'px';
    });
  }

  async sendMessage(message) {
    try {
      const response = await fetch(`/chat/${this.conversationId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          attachments: Array.from(this.uploadedFiles.values())
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      // Clear uploaded files
      this.uploadedFiles.clear();
      this.renderUploadedFiles();
      this.refreshDeckReadiness();

    } catch (error) {
      console.error('[Chat] Error sending message:', error);
      this.addMessage('system', `Error: ${error.message}`);
    }
  }

  addMessage(role, content) {
    const messagesDiv = document.getElementById('messages');

    // Remove empty state if present
    const emptyState = messagesDiv.querySelector('.empty-chat');
    if (emptyState) {
      emptyState.remove();
    }

    // Create message element
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;

    // Icon
    const iconEl = document.createElement('div');
    iconEl.className = 'message-icon';
    iconEl.textContent = role === 'user' ? '👤' : role === 'assistant' ? '🤖' : 'ℹ️';

    // Content wrapper
    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';

    // Text
    const textEl = document.createElement('div');
    textEl.className = 'message-text';
    textEl.textContent = content;

    // Time
    const timeEl = document.createElement('div');
    timeEl.className = 'message-time';
    timeEl.textContent = new Date().toLocaleTimeString();

    // Assemble
    contentEl.appendChild(textEl);
    contentEl.appendChild(timeEl);
    messageEl.appendChild(iconEl);
    messageEl.appendChild(contentEl);
    messagesDiv.appendChild(messageEl);

    this.scrollToBottom();
  }

  appendAssistantChunk(chunk) {
    const messagesDiv = document.getElementById('messages');
    let lastMessage = messagesDiv.lastElementChild;

    // Check if last message is from assistant and still streaming
    if (!lastMessage || !lastMessage.classList.contains('assistant') || !lastMessage.classList.contains('streaming')) {
      // Create new streaming message
      lastMessage = document.createElement('div');
      lastMessage.className = 'message assistant streaming';

      const iconEl = document.createElement('div');
      iconEl.className = 'message-icon';
      iconEl.textContent = '🤖';

      const contentEl = document.createElement('div');
      contentEl.className = 'message-content';

      const textEl = document.createElement('div');
      textEl.className = 'message-text';
      textEl.textContent = chunk;

      contentEl.appendChild(textEl);
      lastMessage.appendChild(iconEl);
      lastMessage.appendChild(contentEl);
      messagesDiv.appendChild(lastMessage);
    } else {
      // Append to existing streaming message
      const textEl = lastMessage.querySelector('.message-text');
      textEl.textContent += chunk;
    }

    this.scrollToBottom();
  }

  finalizeAssistantMessage(messageId) {
    const messagesDiv = document.getElementById('messages');
    const lastMessage = messagesDiv.lastElementChild;

    if (lastMessage && lastMessage.classList.contains('streaming')) {
      lastMessage.classList.remove('streaming');

      // Add timestamp
      const contentEl = lastMessage.querySelector('.message-content');
      const timeEl = document.createElement('div');
      timeEl.className = 'message-time';
      timeEl.textContent = new Date().toLocaleTimeString();
      contentEl.appendChild(timeEl);
    }
  }

  scrollToBottom() {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // ========================================
  // File Upload
  // ========================================

  setupFileUpload() {
    const fileInput = document.getElementById('fileInput');

    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);

      for (const file of files) {
        await this.uploadFile(file);
      }

      // Clear input
      fileInput.value = '';
    });
  }

  async uploadFile(file) {
    const formData = new FormData();
    formData.append('files', file);

    try {
      const response = await fetch(`/chat/${this.conversationId}/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();

      // Store uploaded file info
      result.files.forEach(f => {
        this.uploadedFiles.set(f.id, f);
      });

      this.renderUploadedFiles();
      this.refreshDeckReadiness();

    } catch (error) {
      console.error('[Upload] Error:', error);
      alert(`Failed to upload ${file.name}`);
    }
  }

  renderUploadedFiles() {
    const container = document.getElementById('uploadedFiles');
    container.textContent = ''; // Clear safely

    if (this.uploadedFiles.size === 0) {
      return;
    }

    this.uploadedFiles.forEach((file, id) => {
      const chip = document.createElement('div');
      chip.className = 'file-chip';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = file.filename;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'file-remove';
      removeBtn.textContent = '×';
      removeBtn.onclick = () => {
        this.uploadedFiles.delete(id);
        this.renderUploadedFiles();
      };

      chip.appendChild(nameSpan);
      chip.appendChild(removeBtn);
      container.appendChild(chip);
    });
  }

  // ========================================
  // Deck Workflow
  // ========================================

  setupDeckWorkflow() {
    const planBtn = document.getElementById('deckPlanBtn');
    const runBtn = document.getElementById('deckRunBtn');

    if (planBtn) {
      planBtn.addEventListener('click', async () => {
        await this.generateDeckPlan();
      });
    }

    if (runBtn) {
      runBtn.addEventListener('click', async () => {
        await this.runDeckWorkflow();
      });
    }
  }

  setDeckStatus(text, statusClass = 'deck-status-idle') {
    const el = document.getElementById('deckReadinessStatus');
    if (!el) return;

    el.className = `deck-status ${statusClass}`;
    el.textContent = text;
  }

  renderDeckInputs(readiness) {
    const filesEl = document.getElementById('deckInputFiles');
    if (!filesEl) return;

    filesEl.textContent = '';

    const entries = [
      { label: 'CSV', value: readiness.csv?.filename || 'Missing' },
      { label: 'PPTX', value: readiness.pptx?.filename || 'Missing' }
    ];

    entries.forEach((entry) => {
      const chip = document.createElement('div');
      chip.className = 'deck-input-chip';

      const label = document.createElement('span');
      label.className = 'deck-input-label';
      label.textContent = `${entry.label}:`;

      const value = document.createElement('span');
      value.className = 'deck-input-value';
      value.textContent = entry.value;

      chip.appendChild(label);
      chip.appendChild(value);
      filesEl.appendChild(chip);
    });
  }

  renderDeckPlan(plan) {
    const detailsEl = document.getElementById('deckPlanDetails');
    if (!detailsEl) return;

    detailsEl.textContent = '';

    if (!plan) return;

    const title = document.createElement('div');
    title.className = 'deck-plan-title';
    title.textContent = `Plan: ${plan.jobId}`;

    const list = document.createElement('div');
    list.className = 'deck-plan-list';

    plan.tasks.forEach((task) => {
      const item = document.createElement('div');
      item.className = 'deck-plan-item';

      const name = document.createElement('div');
      name.className = 'deck-plan-name';
      name.textContent = task.taskName;

      const desc = document.createElement('div');
      desc.className = 'deck-plan-desc';
      desc.textContent = task.description;

      const deps = document.createElement('div');
      deps.className = 'deck-plan-deps';
      deps.textContent = task.blockedBy.length > 0
        ? `Depends on: ${task.blockedBy.join(', ')}`
        : 'Depends on: none';

      item.appendChild(name);
      item.appendChild(desc);
      item.appendChild(deps);
      list.appendChild(item);
    });

    detailsEl.appendChild(title);
    detailsEl.appendChild(list);
  }

  async refreshDeckReadiness() {
    const planBtn = document.getElementById('deckPlanBtn');
    const runBtn = document.getElementById('deckRunBtn');

    try {
      const response = await fetch(`/chat/${this.conversationId}/deck-readiness`);
      if (!response.ok) {
        throw new Error('Failed to load deck readiness');
      }

      const readiness = await response.json();
      this.renderDeckInputs(readiness);

      if (readiness.ready) {
        this.setDeckStatus('Ready to generate plan.', 'deck-status-ready');
        if (planBtn) planBtn.disabled = false;
        if (runBtn) runBtn.disabled = !this.deckPlan;
      } else {
        this.deckPlan = null;
        this.renderDeckPlan(null);
        this.setDeckStatus('Upload one CSV and one PPTX to begin.', 'deck-status-idle');
        if (planBtn) planBtn.disabled = true;
        if (runBtn) runBtn.disabled = true;
      }
    } catch (error) {
      console.error('[Deck] Readiness error:', error);
      this.setDeckStatus('Failed to check readiness.', 'deck-status-error');
      if (planBtn) planBtn.disabled = true;
      if (runBtn) runBtn.disabled = true;
    }
  }

  async generateDeckPlan() {
    const planBtn = document.getElementById('deckPlanBtn');
    const runBtn = document.getElementById('deckRunBtn');

    if (planBtn) planBtn.disabled = true;
    this.setDeckStatus('Generating plan...', 'deck-status-running');

    try {
      const response = await fetch(`/chat/${this.conversationId}/deck-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate plan');
      }

      this.deckPlan = data.plan;
      this.renderDeckPlan(this.deckPlan);
      this.setDeckStatus(`Plan ready for ${this.deckPlan.jobId}.`, 'deck-status-ready');
      if (runBtn) runBtn.disabled = false;
    } catch (error) {
      console.error('[Deck] Plan error:', error);
      this.setDeckStatus(`Plan failed: ${error.message}`, 'deck-status-error');
      if (runBtn) runBtn.disabled = true;
    } finally {
      if (planBtn) planBtn.disabled = false;
    }
  }

  async runDeckWorkflow() {
    const planBtn = document.getElementById('deckPlanBtn');
    const runBtn = document.getElementById('deckRunBtn');

    if (!this.deckPlan) {
      this.setDeckStatus('Generate a plan before running.', 'deck-status-error');
      return;
    }

    if (runBtn) runBtn.disabled = true;
    if (planBtn) planBtn.disabled = true;
    this.setDeckStatus(`Starting ${this.deckPlan.jobId}...`, 'deck-status-running');

    try {
      const response = await fetch(`/chat/${this.conversationId}/deck-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: this.deckPlan.jobId })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start deck run');
      }

      this.deckPlan = null;
      this.renderDeckPlan(null);
      this.setDeckStatus(`Run started for ${data.jobId}.`, 'deck-status-ready');
      this.addJobCard(data.jobId);
      this.loadArtifacts(data.jobId);
    } catch (error) {
      console.error('[Deck] Run error:', error);
      this.setDeckStatus(`Run failed: ${error.message}`, 'deck-status-error');
    } finally {
      if (planBtn) planBtn.disabled = false;
      await this.refreshDeckReadiness();
    }
  }

  // ========================================
  // Task Graph Visualization
  // ========================================

  async loadTaskGraphs() {
    for (const job of this.jobs) {
      await this.loadTaskGraph(job.job_id);
    }
  }

  async loadTaskGraph(jobId) {
    try {
      const response = await fetch(`/api/jobs/${jobId}/graph`);
      if (!response.ok) {
        throw new Error('Failed to load task graph');
      }

      const graph = await response.json();
      this.renderTaskGraph(jobId, graph);

    } catch (error) {
      console.error(`[Tasks] Error loading graph for ${jobId}:`, error);

      const container = document.getElementById(`tasks-${jobId}`);
      if (container) {
        container.textContent = 'Failed to load tasks';
      }
    }
  }

  renderTaskGraph(jobId, graph) {
    const container = document.getElementById(`tasks-${jobId}`);
    if (!container) return;

    container.textContent = ''; // Clear safely

    if (!graph.tasks || graph.tasks.length === 0) {
      container.textContent = 'No tasks yet';
      return;
    }

    // Render each task
    graph.tasks.forEach(task => {
      const taskEl = document.createElement('div');
      taskEl.className = 'task-item';
      taskEl.dataset.taskId = task.id;
      taskEl.dataset.status = task.status;

      // Status icon
      const iconEl = document.createElement('span');
      iconEl.className = 'task-icon';
      iconEl.textContent = this.getStatusIcon(task.status);

      // Task name
      const nameEl = document.createElement('span');
      nameEl.className = 'task-name';
      nameEl.textContent = task.task_name;

      // Status badge
      const statusEl = document.createElement('span');
      statusEl.className = 'task-status';
      statusEl.textContent = task.status;

      // Assemble
      taskEl.appendChild(iconEl);
      taskEl.appendChild(nameEl);
      taskEl.appendChild(statusEl);

      // Show dependencies
      if (task.blockedBy && task.blockedBy.length > 0) {
        const depsEl = document.createElement('div');
        depsEl.className = 'task-dependencies';
        depsEl.textContent = `Blocked by: ${task.blockedBy.join(', ')}`;
        taskEl.appendChild(depsEl);
      }

      container.appendChild(taskEl);
    });
  }

  updateTaskStatus(taskId, status, jobId) {
    // Find task element
    const taskEl = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskEl) return;

    // Update status attribute
    taskEl.dataset.status = status;

    // Update icon
    const iconEl = taskEl.querySelector('.task-icon');
    if (iconEl) {
      iconEl.textContent = this.getStatusIcon(status);
    }

    // Update status text
    const statusEl = taskEl.querySelector('.task-status');
    if (statusEl) {
      statusEl.textContent = status;
    }

    // Reload artifacts if task completed
    if (status === 'COMPLETED' && jobId) {
      this.loadArtifacts(jobId);
    }
  }

  getStatusIcon(status) {
    const icons = {
      'PENDING': '☐',
      'READY': '⚡',
      'IN_PROGRESS': '▶',
      'COMPLETED': '✓',
      'FAILED': '✗',
      'NEEDS_REVIEW': '⚠'
    };

    return icons[status] || '?';
  }

  // ========================================
  // Artifacts
  // ========================================

  async loadArtifacts(jobId = null) {
    const jobsToLoad = jobId ? [{ job_id: jobId }] : this.jobs;

    for (const job of jobsToLoad) {
      await this.loadJobArtifacts(job.job_id);
    }
  }

  async loadJobArtifacts(jobId) {
    try {
      const response = await fetch(`/api/jobs/${jobId}/artifacts`);
      if (!response.ok) {
        throw new Error('Failed to load artifacts');
      }

      const data = await response.json();
      this.renderArtifacts(jobId, data.artifacts);

    } catch (error) {
      console.error(`[Artifacts] Error loading for ${jobId}:`, error);
    }
  }

  renderArtifacts(jobId, artifacts) {
    const container = document.getElementById(`artifacts-${jobId}`);
    if (!container) return;

    container.textContent = ''; // Clear safely

    if (!artifacts || artifacts.length === 0) {
      return; // Don't show "No artifacts" message
    }

    // Header
    const header = document.createElement('div');
    header.className = 'artifacts-header';
    header.textContent = 'Artifacts';
    container.appendChild(header);

    // List
    const list = document.createElement('div');
    list.className = 'artifacts-list';

    artifacts.forEach(artifact => {
      const item = document.createElement('div');
      item.className = 'artifact-item';

      const link = document.createElement('a');
      link.href = artifact.path;
      link.download = artifact.filename;
      link.className = 'artifact-link';

      const icon = document.createElement('span');
      icon.className = 'artifact-icon';
      icon.textContent = '📄';

      const name = document.createElement('span');
      name.className = 'artifact-name';
      name.textContent = artifact.filename;

      const size = document.createElement('span');
      size.className = 'artifact-size';
      size.textContent = this.formatFileSize(artifact.size);

      link.appendChild(icon);
      link.appendChild(name);
      link.appendChild(size);
      item.appendChild(link);
      list.appendChild(item);
    });

    container.appendChild(list);
  }

  addArtifact(jobId, filename, size, path) {
    // Reload all artifacts for job
    this.loadJobArtifacts(jobId);
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // ========================================
  // Job Management
  // ========================================

  addJobCard(jobId) {
    if (document.querySelector(`.job-card[data-job-id="${jobId}"]`)) {
      return;
    }

    if (!this.jobs.some(job => job.job_id === jobId)) {
      this.jobs.push({ job_id: jobId });
    }

    const taskPanel = document.getElementById('taskPanel');

    // Remove empty state
    const emptyState = taskPanel.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    // Create job card
    const card = document.createElement('div');
    card.className = 'job-card';
    card.dataset.jobId = jobId;

    // Header
    const header = document.createElement('div');
    header.className = 'job-header';

    const title = document.createElement('strong');
    title.textContent = jobId;

    header.appendChild(title);
    card.appendChild(header);

    // Task list
    const taskList = document.createElement('div');
    taskList.className = 'task-list';
    taskList.id = `tasks-${jobId}`;
    taskList.textContent = 'Loading tasks...';
    card.appendChild(taskList);

    // Artifacts section
    const artifacts = document.createElement('div');
    artifacts.className = 'artifacts-section';
    artifacts.id = `artifacts-${jobId}`;
    card.appendChild(artifacts);

    taskPanel.appendChild(card);

    // Load task graph
    this.loadTaskGraph(jobId);
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.CONVERSATION_ID !== 'undefined') {
    window.chatClient = new ChatClient(
      window.CONVERSATION_ID,
      window.JOBS || []
    );
  }
});
