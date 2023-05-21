'use strict';

const createStartStopButton = require('./lib/browser/startstopbutton');
const fetch = require('node-fetch');
const DefaultRTCPeerConnection = require('wrtc').RTCPeerConnection;
const { RTCSessionDescription } = require('wrtc');

const TIME_TO_HOST_CANDIDATES = 3000;  // NOTE(mroberts): Too long.

class ConnectionClient {
  constructor(options = {}) {
    options = {
      RTCPeerConnection: DefaultRTCPeerConnection,
      clearTimeout,
      host: '',
      prefix: '.',
      setTimeout,
      timeToHostCandidates: TIME_TO_HOST_CANDIDATES,
      ...options
    };

    const {
      RTCPeerConnection,
      prefix,
      host
    } = options;

    this.createConnection = async (options = {}) => {
      options = {
        beforeAnswer() { },
        stereo: false,
        ...options
      };

      const {
        beforeAnswer,
        stereo
      } = options;

      const response1 = await fetch(`${host}/connections`, {
        method: 'POST'
      });

      const remotePeerConnection = await response1.json();
      const { id } = remotePeerConnection;

      const localPeerConnection = new RTCPeerConnection({
        sdpSemantics: 'unified-plan',
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      // NOTE(mroberts): This is a hack so that we can get a callback when the
      // RTCPeerConnection is closed. In the future, we can subscribe to
      // "connectionstatechange" events.
      localPeerConnection.close = function () {
        fetch(`${host}/connections/${id}`, { method: 'delete' }).catch(() => { });
        return RTCPeerConnection.prototype.close.apply(this, arguments);
      };

      try {
        await localPeerConnection.setRemoteDescription(remotePeerConnection.localDescription);
        console.log(remotePeerConnection.localDescription);

        await beforeAnswer(localPeerConnection);

        const originalAnswer = await localPeerConnection.createAnswer();
        const updatedAnswer = new RTCSessionDescription({
          type: 'answer',
          sdp: originalAnswer.sdp
        });
        await localPeerConnection.setLocalDescription(updatedAnswer);

        await fetch(`${host}/connections/${id}/remote-description`, {
          method: 'POST',
          body: JSON.stringify(localPeerConnection.localDescription),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        console.log(localPeerConnection.localDescription);

        return localPeerConnection;
      } catch (error) {
        localPeerConnection.close();
        throw error;
      }
    };
  }
}

function beforeAnswer(peerConnection) {
  let dataChannel = null;
  let interval;
  
  function onMessage({ data }) {
    if (data === 'pong') {
      console.log('received pong');
    }
  }

  function onDataChannel({ channel }) {
    if (channel.label !== 'ping-pong') {
      return;
    }

    dataChannel = channel;
    dataChannel.addEventListener('message', onMessage);

    interval = setInterval(() => {
      console.log('sending ping');
      dataChannel.send('ping');
    }, 1000);
  }

  peerConnection.addEventListener('datachannel', onDataChannel);

  // NOTE(mroberts): This is a hack so that we can get a callback when the
  // RTCPeerConnection is closed. In the future, we can subscribe to
  // "connectionstatechange" events.
  const { close } = peerConnection;
  peerConnection.close = function () {
    if (dataChannel) {
      dataChannel.removeEventListener('message', onMessage);
    }

    if (interval) {
      clearInterval(interval);
    }

    return close.apply(this, arguments);
  };
}

function createExample(name, description, options) {

  const connectionClient = new ConnectionClient();

  let peerConnection = null;

  createStartStopButton(async () => {
    peerConnection = await connectionClient.createConnection(options);
    window.peerConnection = peerConnection;
  }, () => {
    peerConnection.close();
  });
}

createExample('ping-pong', "", { beforeAnswer });
