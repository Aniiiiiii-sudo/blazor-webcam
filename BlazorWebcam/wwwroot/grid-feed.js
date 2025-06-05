window.landmarkHistory = [];
window.gridFeed = {
  loadedCameras: [],

  listAndLoadCameras: async function(containerId) {
    const container = document.getElementById(containerId);
    if (!container || !navigator.mediaDevices) return [];

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(d => d.kind === 'videoinput');
    container.innerHTML = '';
    this.loadedCameras = [];

    for (const device of videoInputs) {
      const video = document.createElement('video');
      video.width = 320;
      video.height = 240;
      video.muted = true;
      video.autoplay = true;
      container.appendChild(video);

      const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: device.deviceId } });
      video.srcObject = stream;

      this.loadedCameras.push({ video, stream });
    }

    return videoInputs.map(d => ({ id: d.deviceId, label: d.label }));
  },

  startRecording: function() {
    if (!this.loadedCameras.length) return;
    window.landmarkHistory = [];
    this.loadedCameras.forEach(c => this._startHolistic(c.video));
  },

  displayGrid: function(containerId) {
    const container = document.getElementById(containerId);
    if (container) container.style.display = 'grid';
  },

  startPoseEstimation: function() {
    this.startRecording();
  },

  stopAll: function() {
    this.loadedCameras.forEach(c => {
      if (c.video._camera) {
        c.video._camera.stop();
        c.video._camera = null;
      }
      if (c.stream) {
        c.stream.getTracks().forEach(t => t.stop());
      }
    });
    this.loadedCameras = [];
  },

  clearHistory: function() {
    window.landmarkHistory = [];
  },

  getHistory: function() {
    return JSON.stringify(window.landmarkHistory);
  },

  _startHolistic: function(video) {
    const holistic = new Holistic.Holistic({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${f}`
    });
    holistic.setOptions({
      selfieMode: true,
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    holistic.onResults(results => {
      const data = {
        faceLandmarks: results.faceLandmarks || [],
        poseLandmarks: results.poseLandmarks || [],
        leftHandLandmarks: results.leftHandLandmarks || [],
        rightHandLandmarks: results.rightHandLandmarks || []
      };
      window.landmarkHistory.push(data);
    });
    const camera = new Camera(video, {
      onFrame: async () => {
        await holistic.send({ image: video });
      },
      width: 320,
      height: 240
    });
    camera.start();
    video._camera = camera;
  }
};
