const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { listJobs } = require('../lib/job-reader');

const router = express.Router();

// GET / - Job list (requires authentication)
router.get('/', requireAuth, (req, res) => {
  try {
    const jobs = listJobs();

    // Filter jobs by role
    let filteredJobs = jobs;
    if (req.session.user.role === 'officer') {
      // Officers see only their own jobs (jobs/ currently doesn't track ownership)
      // For MVP, officers see all jobs (would add ownership field in future)
      filteredJobs = jobs;
    }

    res.render('jobs-list', {
      title: 'Jobs',
      jobs: filteredJobs
    });
  } catch (error) {
    console.error('Error loading jobs:', error);
    res.status(500).render('layout', {
      title: 'Error',
      body: '<h1>Error Loading Jobs</h1><p>An error occurred while loading the job list.</p>'
    });
  }
});

module.exports = router;
