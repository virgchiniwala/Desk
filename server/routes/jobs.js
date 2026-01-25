const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { runRalphScript } = require('../lib/shell-runner');
const { readJobMeta, readJobProgress, readJobLogs, listJobOutputFiles } = require('../lib/job-reader');

const router = express.Router();

// GET /jobs/new - Show job creation form
router.get('/new', requireAuth, (req, res) => {
  res.render('job-create', {
    title: 'Create Job',
    error: req.query.error
  });
});

// POST /jobs - Create new job
router.post('/', requireAuth, async (req, res) => {
  const { jobId, title } = req.body;

  // Validate inputs
  if (!jobId || !title) {
    return res.redirect('/jobs/new?error=Job ID and title are required');
  }

  // Validate job ID format (PROJECT-NNN)
  if (!/^[A-Z]+-[0-9]{3}$/.test(jobId)) {
    return res.redirect('/jobs/new?error=Invalid job ID format (must be PROJECT-NNN)');
  }

  try {
    // Run new-job.sh script
    const result = await runRalphScript('new-job.sh', [jobId, title]);

    if (result.exitCode !== 0) {
      return res.redirect(`/jobs/new?error=${encodeURIComponent(result.stderr || 'Failed to create job')}`);
    }

    // Redirect to job detail
    res.redirect(`/jobs/${jobId}`);
  } catch (error) {
    console.error('Error creating job:', error);
    res.redirect(`/jobs/new?error=${encodeURIComponent(error.message)}`);
  }
});

// GET /jobs/:id - Job detail view
router.get('/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  try {
    const meta = readJobMeta(id);
    const progress = readJobProgress(id);
    const outputFiles = listJobOutputFiles(id);

    res.render('job-detail', {
      title: `Job: ${id}`,
      jobId: id,
      meta,
      progress,
      outputFiles
    });
  } catch (error) {
    console.error('Error loading job:', error);
    res.status(404).render('layout', {
      title: 'Job Not Found',
      body: `<h1>Job Not Found</h1><p>Job ${id} does not exist.</p><p><a href="/">Return to job list</a></p>`
    });
  }
});

// POST /jobs/:id/start-phase - Trigger phase execution
router.post('/:id/start-phase', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { phase, execCommand, timeBudget } = req.body;

  // Validate inputs
  if (!phase || !execCommand) {
    return res.redirect(`/jobs/${id}?error=Phase and command are required`);
  }

  try {
    // Run enqueue.sh script
    const args = [
      id,
      phase,
      '--exec', execCommand,
      '--time-min', timeBudget || '30'
    ];

    const result = await runRalphScript('enqueue.sh', args);

    if (result.exitCode !== 0) {
      return res.redirect(`/jobs/${id}?error=${encodeURIComponent(result.stderr || 'Failed to enqueue phase')}`);
    }

    // Redirect back to job detail with success message
    res.redirect(`/jobs/${id}?success=Phase ${phase} enqueued successfully`);
  } catch (error) {
    console.error('Error enqueuing phase:', error);
    res.redirect(`/jobs/${id}?error=${encodeURIComponent(error.message)}`);
  }
});

// GET /jobs/:id/logs - View job logs
router.get('/:id/logs', requireAuth, (req, res) => {
  const { id } = req.params;

  try {
    const logs = readJobLogs(id);

    res.render('layout', {
      title: `Logs: ${id}`,
      body: `
        <div class="page-header">
          <h1>Logs: ${id}</h1>
          <a href="/jobs/${id}" class="btn-secondary">Back to Job</a>
        </div>
        <pre class="logs">${logs || 'No logs available'}</pre>
      `
    });
  } catch (error) {
    console.error('Error loading logs:', error);
    res.status(404).render('layout', {
      title: 'Logs Not Found',
      body: `<h1>Logs Not Found</h1><p>Logs for job ${id} do not exist.</p><p><a href="/jobs/${id}">Back to job</a></p>`
    });
  }
});

module.exports = router;
