const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const { getJobFilePath } = require('../lib/job-reader');

const router = express.Router();

// GET /artifacts/:jobId/* - Download job output file
router.get('/:jobId/*', requireAuth, (req, res) => {
  const { jobId } = req.params;
  const filePath = req.params[0]; // Everything after /:jobId/

  try {
    // Get safe file path (validates job ID and prevents path traversal)
    const fullPath = getJobFilePath(jobId, filePath);

    // Check file exists
    if (!fs.existsSync(fullPath)) {
      return res.status(404).render('layout', {
        title: 'File Not Found',
        body: `<h1>File Not Found</h1><p>File does not exist: ${filePath}</p><p><a href="/jobs/${jobId}">Back to job</a></p>`
      });
    }

    // Check it's a file (not directory)
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      return res.status(400).render('layout', {
        title: 'Invalid Request',
        body: `<h1>Invalid Request</h1><p>Cannot download directories</p><p><a href="/jobs/${jobId}">Back to job</a></p>`
      });
    }

    // Set content-disposition header to force download
    const filename = path.basename(fullPath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream file
    const fileStream = fs.createReadStream(fullPath);
    fileStream.pipe(res);

    fileStream.on('error', (err) => {
      console.error('Error streaming file:', err);
      if (!res.headersSent) {
        res.status(500).send('Error downloading file');
      }
    });

  } catch (error) {
    console.error('Error accessing file:', error);

    if (error.message.includes('Path traversal') || error.message.includes('Invalid job ID')) {
      return res.status(403).render('layout', {
        title: 'Forbidden',
        body: '<h1>403 - Forbidden</h1><p>Invalid file path</p><p><a href="/">Return to home</a></p>'
      });
    }

    res.status(500).render('layout', {
      title: 'Error',
      body: `<h1>Error</h1><p>${error.message}</p><p><a href="/jobs/${jobId}">Back to job</a></p>`
    });
  }
});

module.exports = router;
