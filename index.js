'use strict';

const bodyParser = require('body-parser');
const browserify = require('browserify-middleware');
const express = require('express');
const { join } = require('path');
const connectionManager = require('./lib/server/connections/connectionmanager');


const app = express();

app.use(bodyParser.json());

const path = join(__dirname);

app.get('/', (req, res) => res.redirect(`index.html`));

const clientPath = join(path, 'client.js');

app.use(`/index.js`, browserify(clientPath));
app.get(`/index.html`, (req, res) => {
  res.sendFile(join(__dirname, 'html', 'index.html'));
});

const cm = new connectionManager();

app.post(`/connections`, async (req, res) => {
  try {
    const connection = await cm.createConnection();
    res.send(connection);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.delete(`/connections/:id`, (req, res) => {
  const { id } = req.params;
  const connection = cm.getConnection(id);
  if (!connection) {
    res.sendStatus(404);
    return;
  }
  cm.deleteConnection(id);
  res.send(connection);
});

app.post(`/connections/:id/remote-description`, async (req, res) => {
  const { id } = req.params;
  const connection = cm.getConnection(id);
  if (!connection) {
    res.sendStatus(404);
    return;
  }
  try {
    await connection.applyAnswer(req.body);
    res.send(connection.toJSON().remoteDescription);
  } catch (error) {
    res.sendStatus(400);
  }
});


const server = app.listen(3000, () => {
  const address = server.address();
  console.log(`http://localhost:${address.port}\n`);

  server.once('close', () => {
    cm => cm.close();
  });
});
