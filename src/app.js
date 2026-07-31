const express = require('express');
const youtubeRouter = require('./routes/youtube');

function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/youtube', youtubeRouter);

  return app;
}

module.exports = { createApp };
