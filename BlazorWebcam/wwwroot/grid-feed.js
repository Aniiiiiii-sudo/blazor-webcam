// Debug log indicating that the grid-feed.js file has been loaded successfully
console.log("[DEBUG] grid-feed.js loaded");

/**
 * Constants and Global Variables
 */
let webcams = []; // Stores a list of available webcam devices
let videoStreams = []; // Stores active video streams for pose estimation
let poseInstances = []; // Stores reusable Pose instances for the estimation process
const MAX_POSE_INSTANCES = 3; // Maximum number of Pose instances that can run simultaneously
let isPoseActive = false; // Flag to indicate whether pose estimation is active
let lastFrameTime = 0; // Timestamp of the last processed frame (used for rate limiting)
const FRAME_RATE_LIMIT = 100; // Time interval in milliseconds for processing frames (10 FPS)

// Defines connections between body landmarks for visualization, based on Mediapipe's pose model
const POSE_CONNECTIONS = [
    // Left arm connections
    [11, 13], [13, 15], [15, 17], [15, 19], [17, 19], [15, 21], [17, 21],
    // Right arm connections
    [12, 14], [14, 16], [16, 18], [16, 20], [18, 20], [16, 22], [18, 22],
    // Torso connections
    [11, 12], [11, 23], [12, 24], [23, 24],
    // Left leg connections
    [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [29, 33], [31, 33],
    // Right leg connections
    [24, 26], [26, 28], [28, 30], [30, 32], [28, 32], [30, 34], [32, 34],
    // Face connections
    [8, 6], [6, 4], [4, 0], [0, 1], [1, 3], [3, 7], [10, 9]
];

/**
 * Webcam Class
 * Represents an individual webcam device and its properties.
 */
class Webcam {
    /**
     * Constructor to initialize webcam details.
     * @param {string} deviceId - Unique ID of the webcam device.
     * @param {string} label - Name or label of the webcam device.
     */
    constructor(deviceId, label) {
        this.deviceId = deviceId; // Unique ID of the webcam device
        this.label = label || "Unnamed Camera"; // Default to "Unnamed Camera" if no label is provided
        this.isActive = false; // Indicates whether the webcam is currently active
        this.resolution = "Unknown"; // Placeholder for the webcam's resolution (width x height)
        this.frameRate = "Unknown"; // Placeholder for the webcam's frame rate
    }

    /**
     * Fetches webcam details such as resolution and frame rate.
     * Uses the MediaDevices API to access the webcam and retrieve its settings.
     */
    async getDetails() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: this.deviceId } }); // Request video stream
            const track = stream.getVideoTracks()[0]; // Access the video track from the stream
            const settings = track.getSettings(); // Retrieve video settings (resolution, frame rate, etc.)

            this.resolution = `${settings.width || "Unknown"}x${settings.height || "Unknown"}`; // Save resolution as a string
            this.frameRate = settings.frameRate ? settings.frameRate.toString() : "Unknown"; // Save frame rate as a string
            this.isActive = true; // Mark webcam as active

            track.stop(); // Stop the video track to release the webcam
        } catch (error) {
            // Log an error if retrieving webcam details fails
            console.error(`[ERROR] Failed to retrieve details for ${this.label}:`, error);
        }
    }
}

/**
 * VideoStream Class
 * Manages a video stream for a specific webcam, including playback and pose estimation results.
 */
class VideoStream {
    /**
     * Constructor to initialize video stream properties.
     * @param {string} deviceId - Unique ID of the webcam device.
     * @param {string} label - Name or label of the webcam device.
     * @param {MediaStream} stream - MediaStream object representing the video feed.
     */
    constructor(deviceId, label, stream) {
        this.deviceId = deviceId; // Unique ID of the webcam device
        this.label = label || "Unnamed Camera"; // Default to "Unnamed Camera" if no label is provided
        this.stream = stream; // MediaStream object for the video feed
        this.videoElement = document.createElement("video"); // Create a <video> element to display the feed
        this.videoElement.srcObject = this.stream; // Assign the video stream to the <video> element
        this.videoElement.autoplay = true; // Enable autoplay for the video
        this.videoElement.playsInline = true; // Ensure video plays inline (important for mobile devices)
        this.poseResults = null; // Placeholder for pose estimation results
    }

    /**
     * Initializes video playback for the stream.
     * Ensures the video element is properly loaded and starts playing.
     */
    async initialize() {
        try {
            await new Promise((resolve, reject) => {
                this.videoElement.onloadedmetadata = resolve; // Resolve when metadata is loaded
                this.videoElement.onerror = reject; // Reject if an error occurs
            });
            await this.videoElement.play(); // Start video playback
            console.log(`[DEBUG] Initialized video stream for ${this.label}`); // Log success message
        } catch (error) {
            // Log an error if video initialization fails
            console.error(`[ERROR] Failed to initialize video stream for ${this.label}:`, error);
        }
    }

    /**
     * Stops the video stream and releases associated resources.
     */
    stop() {
        this.stream.getTracks().forEach((track) => track.stop()); // Stop all tracks in the stream
        console.log(`[DEBUG] Stopped video stream for ${this.label}`); // Log success message
    }
}

/**
 * SkeletonMp Class
 * Manages pose data (landmarks and visibility) for each webcam.
 */
class SkeletonMp {
    /**
     * Constructor to initialize pose data storage.
     */
    constructor() {
        this.poseData = {}; // Object to hold pose data for each webcam (keyed by deviceId)
    }

    /**
     * Adds pose data for a specific webcam.
     * @param {string} deviceId - Unique ID of the webcam.
     * @param {Array} poseLandmarks - Array of pose landmarks detected.
     */
    addPoseData(deviceId, poseLandmarks) {
        const landmarkNames = [
            "nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye", "right_eye_outer",
            "left_ear", "right_ear", "mouth_left", "mouth_right", "left_shoulder", "right_shoulder", "left_elbow",
            "right_elbow", "left_wrist", "right_wrist", "left_pinky", "right_pinky", "left_index", "right_index",
            "left_thumb", "right_thumb", "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
            "left_heel", "right_heel", "left_foot_index", "right_foot_index"
        ];

        // Map pose landmarks to their names and coordinates
        this.poseData[deviceId] = poseLandmarks.map((landmark, index) => ({
            name: landmarkNames[index],
            x: landmark.x,
            y: landmark.y,
            z: landmark.z,
            visibility: landmark.visibility
        }));
    }

    /**
     * Retrieves pose data for a specific webcam.
     * @param {string} deviceId - Unique ID of the webcam.
     * @returns {Array|null} - Pose landmarks for the specified webcam, or null if none exist.
     */
    getPoseData(deviceId) {
        return this.poseData[deviceId] || null;
    }

    /**
     * Retrieves pose data for all webcams.
     * @returns {Object} - Object containing pose data for all webcams.
     */
    getAllPoseData() {
        return this.poseData;
    }
}

// Create a global instance of SkeletonMp to manage pose data
const skeletonMp = new SkeletonMp();



/**
 * Fetches and returns available webcam devices.
 * Uses the MediaDevices API to enumerate connected media devices and filters for video input devices (webcams).
 * Populates the `webcams` array with instances of the `Webcam` class.
 * @returns {Promise<Array>} - A list of webcams with their details (suitable for passing to C#).
 */
async function getAvailableCameras() {
    console.log("[DEBUG] getAvailableCameras called"); // Log debug message for function entry
    try {
        const devices = await navigator.mediaDevices.enumerateDevices(); // Fetch all available media devices
        const videoDevices = devices.filter((device) => device.kind === "videoinput"); // Filter only video input devices (webcams)
        console.log("[DEBUG] Video devices:", videoDevices); // Log the list of video devices

        // Create Webcam instances for each video device and populate the `webcams` array
        webcams = videoDevices.map((device) => new Webcam(device.deviceId, device.label));
        for (const webcam of webcams) {
            await webcam.getDetails(); // Fetch additional details (resolution, frame rate) for each webcam
        }

        // Return an array of webcam details in a format compatible with other parts of the application
        return webcams.map((webcam) => ({
            deviceId: webcam.deviceId, // Unique ID of the webcam
            label: webcam.label, // User-friendly name or label for the webcam
            resolution: webcam.resolution, // Resolution of the webcam (e.g., "1280x720")
            frameRate: webcam.frameRate, // Frame rate of the webcam
            isActive: webcam.isActive.toString() // Convert boolean to string for compatibility
        }));
    } catch (error) {
        // Log an error message if fetching webcams fails
        console.error("[ERROR] Failed to fetch available cameras:", error);
        throw error; // Re-throw the error to allow the calling function to handle it
    }
}

/**
 * Starts video streams for the selected webcams.
 * Uses the MediaDevices API to request video streams for the specified device IDs and initializes them as VideoStream instances.
 * @param {Array<string>} selectedDeviceIds - List of device IDs for the webcams to activate.
 */
async function startRecordingAll(selectedDeviceIds) {
    for (const deviceId of selectedDeviceIds) { // Iterate over each selected device ID
        const webcam = webcams.find((w) => w.deviceId === deviceId); // Find the corresponding Webcam instance
        if (!webcam) { // Check if the webcam exists in the list
            console.warn(`No webcam found for device ID: ${deviceId}`); // Log a warning if the webcam is not found
            continue; // Skip to the next device ID
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId } }); // Request the video stream
            const videoStream = new VideoStream(deviceId, webcam.label, stream); // Create a VideoStream instance
            await videoStream.initialize(); // Initialize the video stream (playback)
            videoStreams.push(videoStream); // Add the video stream to the global list
        } catch (error) {
            // Log an error message if starting the video feed fails
            console.error(`Error starting video feed for ${webcam.label}:`, error);
        }
    }
}

/**
 * Displays video streams in a grid format with pose overlays.
 * Dynamically creates canvas elements for each video stream and renders the video feed along with pose landmarks and connections.
 * @param {string} containerId - The ID of the HTML container where the grid should be displayed.
 */
function displayGridFeedWithCanvases(containerId) {
    const container = document.getElementById(containerId); // Get the container element by its ID
    if (!container) { // Check if the container exists
        console.error("[ERROR] Container not found"); // Log an error if the container does not exist
        return; // Exit the function early
    }

    container.innerHTML = ""; // Clear any existing content in the container

    videoStreams.forEach((videoStream, index) => { // Loop through each video stream
        const canvas = document.createElement("canvas"); // Create a canvas element for rendering
        canvas.width = 640; // Set the canvas width
        canvas.height = 480; // Set the canvas height
        container.appendChild(canvas); // Append the canvas to the container

        const ctx = canvas.getContext("2d"); // Get the 2D rendering context for the canvas

        /**
         * Function to render each frame of the video and overlay pose landmarks.
         */
        function renderFrame() {
            try {
                // Ensure the video element has sufficient data to render
                if (videoStream.videoElement.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
                    requestAnimationFrame(renderFrame); // Request the next frame if data is not ready
                    return; // Exit early
                }

                // Clear the canvas for the current frame
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Draw the video frame onto the canvas
                ctx.drawImage(videoStream.videoElement, 0, 0, canvas.width, canvas.height);

                // Check if pose results are available for this video stream
                if (videoStream.poseResults?.poseLandmarks) {
                    // Draw the connections between pose landmarks
                    drawConnectors(ctx, videoStream.poseResults.poseLandmarks, POSE_CONNECTIONS, { color: "green", lineWidth: 2 });
                    // Draw the individual pose landmarks
                    drawLandmarks(ctx, videoStream.poseResults.poseLandmarks, { color: "red", radius: 4 });

                    // Retrieve all pose data and log it (for debugging or further processing)
                    const allPoseData = skeletonMp.getAllPoseData();
                    console.log("Pose data for all webcams:", allPoseData);
                }

                // Request the next animation frame for smooth rendering
                requestAnimationFrame(renderFrame);
            } catch (error) {
                // Log any errors encountered during the rendering process
                console.error(`[ERROR] Error in render loop for ${videoStream.label}:`, error);
            }
        }

        renderFrame(); // Start the rendering loop for the current video stream
    });

    console.log("[DEBUG] Grid feed displayed."); // Log a debug message indicating the grid feed has been displayed
}

/**
 * Toggles pose estimation on or off.
 * If activated, processes frames to detect poses using the initialized Pose instances.
 */
async function togglePoseEstimation() {
    if (isPoseActive) { // Check if pose estimation is already active
        isPoseActive = false; // Deactivate pose estimation
        console.log("[DEBUG] Pose estimation stopped."); // Log a debug message
        return; // Exit the function early
    }

    isPoseActive = true; // Activate pose estimation
    console.log("[DEBUG] Pose estimation started."); // Log a debug message

    if (poseInstances.length === 0) { // Check if Pose instances have been initialized
        initializePosePool(); // Initialize the Pose pool
    }

    /**
     * Processes video frames for pose estimation.
     */
    const processFrames = async () => {
        const now = performance.now(); // Get the current timestamp
        // Enforce the frame rate limit by skipping frames processed too quickly
        if (now - lastFrameTime < FRAME_RATE_LIMIT) {
            if (isPoseActive) {
                requestAnimationFrame(processFrames); // Schedule the next frame
            }
            return; // Exit early
        }
        lastFrameTime = now; // Update the timestamp for the last processed frame

        // Loop through all video streams and process each frame
        for (let i = 0; i < videoStreams.length; i++) {
            const videoStream = videoStreams[i];
            const pose = poseInstances[i % MAX_POSE_INSTANCES]; // Cycle through Pose instances

            // Ensure the video element has sufficient data
            if (videoStream.videoElement.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                try {
                    // Send the video frame to the Pose instance for processing
                    await pose.send({ image: videoStream.videoElement });
                    videoStream.poseResults = pose.poseResults || null; // Update pose results

                    // Update SkeletonMp with the new pose data
                    if (pose.poseResults?.poseLandmarks) {
                        skeletonMp.addPoseData(videoStream.deviceId, pose.poseResults.poseLandmarks);
                    }
                } catch (error) {
                    // Log a warning if frame processing fails
                    console.warn(`Failed to process frame for ${videoStream.label}:`, error);
                }
            }
        }

        // Continue processing frames if pose estimation is active
        if (isPoseActive) {
            requestAnimationFrame(processFrames);
        }
    };

    processFrames(); // Start processing frames for pose estimation
}

/**
 * Initializes a pool of Pose instances for reuse.
 * Creates and configures the Pose instances based on Mediapipe settings.
 */
function initializePosePool() {
    poseInstances = []; // Reset the Pose instance pool
    for (let i = 0; i < MAX_POSE_INSTANCES; i++) { // Create the specified number of Pose instances
        const pose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`, // Provide the Mediapipe library path
        });

        // Configure the Pose instance with options
        pose.setOptions({
            modelComplexity: 0, // Use a lightweight model
            smoothLandmarks: true, // Enable landmark smoothing
            enableSegmentation: false, // Disable segmentation
            minDetectionConfidence: 0.5, // Minimum confidence threshold for pose detection
            minTrackingConfidence: 0.5, // Minimum confidence threshold for pose tracking
        });

        // Store the results from the Pose instance
        pose.onResults((results) => {
            pose.poseResults = results;
        });

        poseInstances.push(pose); // Add the Pose instance to the pool
    }
    console.log("[DEBUG] Pose pool initialized with size:", MAX_POSE_INSTANCES); // Log success message
}


/**
 * Draws connectors (lines) between specified pose landmarks on a canvas.
 * Useful for visualizing the relationships between key points in the pose model.
 * 
 * @param {CanvasRenderingContext2D} ctx - The 2D rendering context for the canvas.
 * @param {Array} landmarks - Array of pose landmarks, where each landmark contains x, y, z, and visibility values.
 * @param {Array} connections - Array of connections, where each connection is a pair of indices representing landmarks to connect.
 * @param {Object} style - Styling options for the connectors (color and lineWidth).
 * @param {string} style.color - The color of the connector lines (default is red).
 * @param {number} style.lineWidth - The thickness of the connector lines (default is 20).
 */
function drawConnectors(ctx, landmarks, connections, style) {
    ctx.strokeStyle = style.color || "#FF0000"; // Set the color of the lines (default is red)
    ctx.lineWidth = style.lineWidth || 20; // Set the line thickness (default is 20)

    // Iterate over all specified connections
    connections.forEach(([start, end]) => {
        // Ensure both landmarks in the connection exist and are valid
        if (landmarks[start] && landmarks[end]) {
            ctx.beginPath(); // Begin a new path for the line
            // Move to the starting landmark position
            ctx.moveTo(
                landmarks[start].x * ctx.canvas.width, // Scale the x-coordinate to canvas width
                landmarks[start].y * ctx.canvas.height // Scale the y-coordinate to canvas height
            );
            // Draw a line to the ending landmark position
            ctx.lineTo(
                landmarks[end].x * ctx.canvas.width, // Scale the x-coordinate to canvas width
                landmarks[end].y * ctx.canvas.height // Scale the y-coordinate to canvas height
            );
            ctx.stroke(); // Render the line on the canvas
        }
    });
}


/**
 * Draws individual pose landmarks (points) on a canvas.
 * Useful for marking key points in the pose model (e.g., joints, facial features).
 * 
 * @param {CanvasRenderingContext2D} ctx - The 2D rendering context for the canvas.
 * @param {Array} landmarks - Array of pose landmarks, where each landmark contains x, y, z, and visibility values.
 * @param {Object} style - Styling options for the landmarks (color and radius).
 * @param {string} style.color - The color of the landmark points (default is red).
 * @param {number} style.radius - The radius of the landmark points (default is 4).
 */
function drawLandmarks(ctx, landmarks, style) {
    ctx.fillStyle = style.color || "#FF0000"; // Set the color of the points (default is red)

    // Iterate over all landmarks in the array
    landmarks.forEach(({ x, y }) => {
        ctx.beginPath(); // Begin a new path for the point
        // Create a circular point at the landmark's position
        ctx.arc(
            x * ctx.canvas.width, // Scale the x-coordinate to canvas width
            y * ctx.canvas.height, // Scale the y-coordinate to canvas height
            style.radius || 4, // Set the radius of the point (default is 4)
            0, // Starting angle of the arc (0 radians)
            2 * Math.PI // Ending angle of the arc (full circle)
        );
        ctx.fill(); // Render the point on the canvas
    });
}
