'use strict';

const uuidv4 = require('uuid/v4');
const WebRtcConnection = require('./webrtcconnection');

class ConnectionManager {

  connections = new Map();

  constructor() { }

  createId() {
    do {
      const id = uuidv4();
      if (!this.connections.has(id)) {
        return id;
      }
      // eslint-disable-next-line
    } while (true);
  }

  getConnection(id) {
    return this.connections.get(id) || null;
  };

  getConnections() {
    return [...this.connections.values()];
  };

  deleteConnection(id) {
    let connection = this.getConnection(id)
    connection.close()

    this.connections.delete(id);
  }

  async createConnection() {
    const id = this.createId();
    const connection = new WebRtcConnection(id);

    // 1. Add the "closed" listener.
    // connection.once('closed', () => console.log("connection deleted"));

    // 2. Add the Connection to the Map.
    this.connections.set(connection.id, connection);

    await connection.doOffer();

    return connection;
  };

  toJSON() {
    return this.getConnections().map(connection => connection.toJSON());
  }
}

module.exports = ConnectionManager;
