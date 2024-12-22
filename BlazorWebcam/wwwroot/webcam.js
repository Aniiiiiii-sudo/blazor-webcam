let mediaRecorder; // Holds the MediaRecorder instance for recording
let recordedChunks = []; // Array to store video chunks

// Start the webcam stream
window.startVideo = function (src) {
    // Request access to the user's webcam
    navigator.mediaDevices.getUserMedia({ video: true }).then(function (stream) {
        let video = document.getElementById(src); // Get the video element by ID
        video.srcObject = stream; // Set the video stream as the source for the video element
        video.play(); // Start playing the video
        console.log("Webcam stream started.");
    });
};

// Stop the webcam stream
window.stopVideo = function (src) {
    let video = document.getElementById(src); // Get the video element by ID
    let stream = video.srcObject; // Get the current stream from the video element
    if (stream) {
        // Stop all tracks (video/audio) in the stream
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null; // Remove the stream from the video element
        console.log("Webcam stream stopped.");
    }
};

// Start recording the webcam feed
window.startRecording = function (src) {
    let video = document.getElementById(src); // Get the video element by ID
    let stream = video.srcObject; // Get the current stream from the video element

    if (stream) {
        mediaRecorder = new MediaRecorder(stream); // Create a new MediaRecorder instance
        recordedChunks = []; // Clear any previous recorded chunks

        // Event triggered when a data chunk is available
        mediaRecorder.ondataavailable = function (event) {
            if (event.data.size > 0) recordedChunks.push(event.data); // Store the chunk
        };

        // Event triggered when recording stops
        mediaRecorder.onstop = function () {
            // Combine the chunks into a single Blob
            const blob = new Blob(recordedChunks, { type: 'video/webm' });

            // Create a download link for the recorded video
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'recording.webm';
            a.click(); // Trigger the download
            console.log("Recording saved.");
        };

        mediaRecorder.start(); // Start recording
        console.log("Recording started.");
    } else {
        console.error("No video stream available.");
    }
};

// Start pose estimation using Mediapipe
window.startPoseEstimation = async function (src, canvasId) {
    const video = document.getElementById(src); // Get the video element by ID
    const canvas = document.getElementById(canvasId); // Get the canvas element by ID
    const ctx = canvas.getContext('2d'); // Get the 2D drawing context

    // Initialize the Mediapipe Pose object
    const pose = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`, // Load necessary files
    });

    // Set options for the pose model
    pose.setOptions({
        modelComplexity: 1, // Higher complexity gives more accurate results
        smoothLandmarks: true, // Enable smoothing of pose landmarks
        enableSegmentation: false, // Disable segmentation for simplicity
    });

    // Event triggered when pose results are available
    pose.onResults((results) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas

        // If pose landmarks are detected, draw them on the canvas
        if (results.poseLandmarks) {
            console.log("Pose Landmarks:", results.poseLandmarks); // Log the landmarks to the console
            // Draw the pose landmarks and connections on the canvas
            drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
            drawLandmarks(ctx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });
        }
    });

    // Initialize the camera to capture frames for pose estimation
    const camera = new Camera(video, {
        onFrame: async () => await pose.send({ image: video }), // Send each frame to the pose model
        width: 640, // Camera frame width
        height: 480, // Camera frame height
    });
    camera.start(); // Start the camera
    console.log("Pose estimation started.");
};
