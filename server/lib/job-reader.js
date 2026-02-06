const fs = require('fs');
const path = require('path');

// Base jobs directory (absolute path)
const JOBS_DIR = path.resolve(__dirname, '../../jobs');

/**
 * Validate job ID format
 *
 * SECURITY: Prevents path traversal via job ID
 * - Must match PROJECT-NNN pattern
 * - No path separators (/, \)
 * - No path traversal sequences (.., .)
 *
 * @param {string} jobId - Job ID to validate
 * @returns {boolean} true if valid
 */
function isValidJobId(jobId) {
  // Must match PROJECT-NNN format (uppercase letters, hyphen, 3 digits)
  return /^[A-Z]+-[0-9]{3}$/.test(jobId);
}

/**
 * Get safe path to job directory
 *
 * SECURITY:
 * - Validates job ID format
 * - Resolves to absolute path
 * - Verifies path is within jobs/ directory
 *
 * @param {string} jobId - Job ID
 * @returns {string} Absolute path to job directory
 * @throws {Error} if job ID invalid or path escapes jobs/
 */
function getJobPath(jobId) {
  if (!isValidJobId(jobId)) {
    throw new Error('Invalid job ID format: must match PROJECT-NNN');
  }

  // Resolve to absolute path
  const jobPath = path.resolve(JOBS_DIR, jobId);

  // Security check: ensure resolved path is within jobs/ directory
  if (!jobPath.startsWith(JOBS_DIR + path.sep)) {
    throw new Error('Path traversal detected');
  }

  return jobPath;
}

/**
 * Get safe path to file within job directory
 *
 * SECURITY:
 * - Validates job ID
 * - Normalizes requested file path
 * - Verifies resolved path stays within job directory
 *
 * @param {string} jobId - Job ID
 * @param {string} filePath - Relative path within job (e.g., 'output/result.txt')
 * @returns {string} Absolute path to file
 * @throws {Error} if path invalid or escapes job directory
 */
function getJobFilePath(jobId, filePath) {
  const jobPath = getJobPath(jobId);

  // Normalize and resolve the file path
  const normalizedPath = path.normalize(filePath);

  // Reject if path starts with .. or contains .. segments
  if (normalizedPath.startsWith('..') || normalizedPath.includes(path.sep + '..')) {
    throw new Error('Path traversal detected in file path');
  }

  const fullPath = path.resolve(jobPath, normalizedPath);

  // Security check: ensure resolved path is within job directory
  if (!fullPath.startsWith(jobPath + path.sep) && fullPath !== jobPath) {
    throw new Error('Path traversal detected');
  }

  return fullPath;
}

/**
 * Read job metadata (meta.json)
 *
 * @param {string} jobId - Job ID
 * @returns {Object} Parsed meta.json
 * @throws {Error} if job not found or invalid
 */
function readJobMeta(jobId) {
  const metaPath = getJobFilePath(jobId, 'meta.json');

  if (!fs.existsSync(metaPath)) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const content = fs.readFileSync(metaPath, 'utf8');
  return JSON.parse(content);
}

/**
 * Read job progress (progress.md)
 *
 * @param {string} jobId - Job ID
 * @returns {string} Progress markdown content
 */
function readJobProgress(jobId) {
  const progressPath = getJobFilePath(jobId, 'progress.md');

  if (!fs.existsSync(progressPath)) {
    return '';
  }

  return fs.readFileSync(progressPath, 'utf8');
}

/**
 * Read job logs (tmp/worker.log)
 *
 * @param {string} jobId - Job ID
 * @returns {string} Log content
 */
function readJobLogs(jobId) {
  const logPath = getJobFilePath(jobId, 'tmp/worker.log');

  if (!fs.existsSync(logPath)) {
    return '';
  }

  return fs.readFileSync(logPath, 'utf8');
}

/**
 * List all jobs (reads jobs/ directory)
 *
 * @returns {Array<{jobId: string, meta: Object}>} Array of jobs with metadata
 */
function listJobs() {
  if (!fs.existsSync(JOBS_DIR)) {
    return [];
  }

  const entries = fs.readdirSync(JOBS_DIR, { withFileTypes: true });

  return entries
    .filter(entry => entry.isDirectory())
    .filter(entry => isValidJobId(entry.name))
    .map(entry => {
      try {
        const meta = readJobMeta(entry.name);
        return { jobId: entry.name, meta };
      } catch (err) {
        // Skip jobs with invalid or missing meta.json
        return null;
      }
    })
    .filter(job => job !== null)
    .sort((a, b) => b.meta.created.localeCompare(a.meta.created)); // Newest first
}

/**
 * List files in job's output directory with metadata
 *
 * @param {string} jobId - Job ID
 * @returns {Array<{name:string,relativePath:string,size:number,mtime:string}>}
 */
function listJobOutputFiles(jobId) {
  const outputPath = getJobFilePath(jobId, 'output');

  if (!fs.existsSync(outputPath)) {
    return [];
  }

  const files = [];

  function walkDir(dir, prefix = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = path.join(prefix, entry.name);

      if (entry.isDirectory()) {
        walkDir(path.join(dir, entry.name), relativePath);
      } else {
        const fullPath = path.join(dir, entry.name);
        const stats = fs.statSync(fullPath);
        files.push({
          name: entry.name,
          relativePath,
          size: stats.size,
          mtime: stats.mtime.toISOString()
        });
      }
    }
  }

  walkDir(outputPath);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

module.exports = {
  isValidJobId,
  getJobPath,
  getJobFilePath,
  readJobMeta,
  readJobProgress,
  readJobLogs,
  listJobs,
  listJobOutputFiles,
  JOBS_DIR
};
