'use strict';

const DefaultRTCPeerConnection = require('wrtc').RTCPeerConnection;
const Connection = require('./connection');

class WebRtcConnection extends Connection {

  peerConnection;
  dataChannel;
  timeToConnected = 10000;
  timeToHostCandidates = 3000;  // NOTE(mroberts): Too long.
  timeToReconnected = 10000;
  connectionTimer;
  reconnectionTimer;

  get iceConnectionState() { return this.peerConnection.iceConnectionState; }
  get localDescription() { return descriptionToJSON(this.peerConnection.localDescription, true) }
  get remoteDescription() { return descriptionToJSON(this.peerConnection.remoteDescription); }
  get signalingState() { return this.peerConnection.signalingState; }


  constructor(id) {
    super(id);
    let self = this
    this.peerConnection = new DefaultRTCPeerConnection({ sdpSemantics: 'unified-plan' });

    // Datachannel init

    this.dataChannel = this.peerConnection.createDataChannel('ping-pong');
    this.dataChannel.addEventListener('message', onMessage);

    // End init datachannel

    this.connectionTimer = setTimeout(() => {
      if (this.peerConnection.iceConnectionState !== 'connected'
        && this.peerConnection.iceConnectionState !== 'completed') {
        this.close();
      }
    }, this.timeToConnected);

    this.reconnectionTimer = null;

    this.peerConnection.addEventListener('iceconnectionstatechange', this.onIceConnectionStateChange);
  }

  onIceConnectionStateChange() {
    let self = this;
    console.log(this.iceConnectionState);
    switch (this.iceConnectionState) {
      //
      case 'connected':
      case 'completed':
        if (self.connectionTimer) {
          clearTimeout(this.connectionTimer);
          self.connectionTimer = null;
        }
        clearTimeout(this.reconnectionTimer);
        self.reconnectionTimer = null;
        break;
      //
      case 'disconnected':
      case 'failed':
        if (!self.connectionTimer && !self.reconnectionTimer) {
          self.reconnectionTimer = setTimeout(() => {
            self.close();
          }, self.timeToReconnected);
        }
      default:
        break;
    }
  };

  async doOffer() {
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    try {
      await this.waitUntilIceGatheringStateComplete();
    } catch (error) {
      this.close();
      throw error;
    }
  };

  async applyAnswer(answer) {
    await this.peerConnection.setRemoteDescription(answer);
  };

  close() {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = null;
    }
    self.dataChannel.removeEventListener('message', onMessage);
    this.removeEventListener('iceconnectionstatechange', this.onIceConnectionStateChange);
    this.peerConnection.close();
    super.close();
  };

  toJSON() {
    return {
      ...super.toJSON(),
      iceConnectionState: this.iceConnectionState,
      localDescription: this.localDescription,
      remoteDescription: this.remoteDescription,
      signalingState: this.signalingState
    };
  };

  async waitUntilIceGatheringStateComplete() {
    if (this.peerConnection.iceGatheringState === 'complete') {
      return;
    }

    const deferred = {};
    deferred.promise = new Promise((resolve, reject) => {
      deferred.resolve = resolve;
      deferred.reject = reject;
    });

    const timeout = setTimeout(() => {
      this.peerConnection.removeEventListener('icecandidate', onIceCandidate);
      deferred.reject(new Error('Timed out waiting for host candidates'));
    }, this.timeToHostCandidates);

    function onIceCandidate({ candidate }) {
      if (!candidate) {
        clearTimeout(timeout);
        this.removeEventListener('icecandidate', onIceCandidate);
        deferred.resolve();
      }
    }

    this.peerConnection.addEventListener('icecandidate', onIceCandidate);

    await deferred.promise;
  }
}

function onMessage({ data }) {
  if (data === 'ping') {
    this.send('pong');
  }
}

function descriptionToJSON(description, shouldDisableTrickleIce) {
  return !description ? {} : {
    type: description.type,
    sdp: shouldDisableTrickleIce ? disableTrickleIce(description.sdp) : description.sdp
  };
}

function disableTrickleIce(sdp) {
  return sdp.replace(/\r\na=ice-options:trickle/g, '');
}

module.exports = WebRtcConnection;