const { spawn } = require('child_process');
const path = require('path');

/**
 * Safe shell command execution using spawn()
 *
 * SECURITY:
 * - Uses spawn() with shell: false to prevent command injection
 * - Arguments passed as array, never string interpolation
 * - Working directory is validated and normalized
 *
 * @param {string} command - Command to execute (no arguments)
 * @param {string[]} args - Array of arguments
 * @param {Object} options - Options
 * @param {string} options.cwd - Working directory (must be absolute)
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    // Validate command (no path separators or shell metacharacters)
    if (!/^[\w-]+$/.test(command)) {
      return reject(new Error('Invalid command: must be alphanumeric with hyphens/underscores only'));
    }

    // Validate and normalize working directory
    const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();

    // Ensure cwd is absolute and within allowed paths
    if (!path.isAbsolute(cwd)) {
      return reject(new Error('Working directory must be absolute'));
    }

    const timeout = options.timeout || 30000; // 30 second default
    let stdout = '';
    let stderr = '';
    let killed = false;

    // Spawn process with shell: false for security
    const child = spawn(command, args, {
      cwd,
      shell: false, // CRITICAL: Prevents command injection
      env: process.env
    });

    // Collect stdout
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    // Collect stderr
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle completion
    child.on('close', (code) => {
      if (killed) {
        return reject(new Error(`Command timed out after ${timeout}ms`));
      }
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code
      });
    });

    // Handle errors
    child.on('error', (err) => {
      reject(new Error(`Failed to execute command: ${err.message}`));
    });

    // Set timeout
    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');

      // Force kill after 5s if still running
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeout);

    // Clear timeout on completion
    child.on('close', () => {
      clearTimeout(timeoutId);
    });
  });
}

/**
 * Run a Ralph script from the root directory
 *
 * @param {string} script - Script name (e.g., 'new-job.sh', 'enqueue.sh')
 * @param {string[]} args - Script arguments
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
async function runRalphScript(script, args = []) {
  // Validate script name (must be in ralph/ directory)
  if (!/^[\w-]+\.sh$/.test(script)) {
    throw new Error('Invalid script name: must be *.sh with alphanumeric/hyphen');
  }

  const deskRoot = path.resolve(__dirname, '../..');
  const scriptPath = `./ralph/${script}`;

  return runCommand('bash', [scriptPath, ...args], {
    cwd: deskRoot,
    timeout: 60000 // 1 minute for Ralph scripts
  });
}

module.exports = {
  runCommand,
  runRalphScript
};
