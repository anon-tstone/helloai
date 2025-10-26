// Global variables
let video, canvas, ctx;
let detector;
let currentFilter = 'none';
let scene, camera, renderer;
let filterObjects = {};
let animationId;
let showLandmarks = true;

// Initialize the application
async function init() {
    updateStatus('กำลังเริ่มต้น...', 'info');

    // Get elements
    video = document.getElementById('video');
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');

    // Setup camera
    try {
        await setupCamera();
        updateStatus('กำลังโหลดโมเดล AI...', 'info');
    } catch (error) {
        updateStatus('ไม่สามารถเข้าถึงกล้องได้: ' + error.message, 'error');
        return;
    }

    // Setup face detection
    try {
        await setupFaceDetection();
        updateStatus('กำลังเตรียม 3D...', 'info');
    } catch (error) {
        updateStatus('โหลดโมเดลไม่สำเร็จ: ' + error.message, 'error');
        return;
    }

    // Setup Three.js
    setupThreeJS();

    // Setup controls
    setupControls();

    // Start detection loop
    updateStatus('พร้อมใช้งาน! 😊', 'success');
    detectFaces();
}

// Setup camera
async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
        },
        audio: false
    });

    video.srcObject = stream;

    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            resolve();
        };
    });
}

// Setup face detection
async function setupFaceDetection() {
    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    const detectorConfig = {
        runtime: 'mediapipe',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
        refineLandmarks: true,
        maxFaces: 1
    };
    detector = await faceLandmarksDetection.createDetector(model, detectorConfig);
}

// Setup Three.js for 3D rendering
function setupThreeJS() {
    // Create scene
    scene = new THREE.Scene();

    // Create camera
    camera = new THREE.PerspectiveCamera(
        75,
        canvas.width / canvas.height,
        0.1,
        1000
    );
    camera.position.z = 5;

    // Create renderer
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true
    });
    renderer.setSize(canvas.width, canvas.height);
    renderer.setClearColor(0x000000, 0);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 1, 1);
    scene.add(directionalLight);

    // Create filter objects
    createFilters();
}

// Create 3D filter objects
function createFilters() {
    // Glasses
    const glassesGroup = new THREE.Group();

    // Frames
    const frameGeometry = new THREE.TorusGeometry(0.5, 0.08, 16, 32);
    const frameMaterial = new THREE.MeshPhongMaterial({
        color: 0x000000,
        shininess: 100
    });

    const leftFrame = new THREE.Mesh(frameGeometry, frameMaterial);
    leftFrame.position.x = -0.6;
    glassesGroup.add(leftFrame);

    const rightFrame = new THREE.Mesh(frameGeometry, frameMaterial);
    rightFrame.position.x = 0.6;
    glassesGroup.add(rightFrame);

    // Bridge
    const bridgeGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.2, 16);
    const bridge = new THREE.Mesh(bridgeGeometry, frameMaterial);
    bridge.rotation.z = Math.PI / 2;
    glassesGroup.add(bridge);

    // Lenses
    const lensGeometry = new THREE.CircleGeometry(0.45, 32);
    const lensMaterial = new THREE.MeshPhongMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
    });

    const leftLens = new THREE.Mesh(lensGeometry, lensMaterial);
    leftLens.position.set(-0.6, 0, 0.05);
    glassesGroup.add(leftLens);

    const rightLens = new THREE.Mesh(lensGeometry, lensMaterial);
    rightLens.position.set(0.6, 0, 0.05);
    glassesGroup.add(rightLens);

    filterObjects.glasses = glassesGroup;
    scene.add(glassesGroup);
    glassesGroup.visible = false;

    // Mask
    const maskGroup = new THREE.Group();
    const maskGeometry = new THREE.SphereGeometry(1, 32, 32, 0, Math.PI);
    const maskMaterial = new THREE.MeshPhongMaterial({
        color: 0xff6b9d,
        side: THREE.DoubleSide
    });
    const mask = new THREE.Mesh(maskGeometry, maskMaterial);
    mask.rotation.y = Math.PI;
    maskGroup.add(mask);

    filterObjects.mask = maskGroup;
    scene.add(maskGroup);
    maskGroup.visible = false;

    // Bunny ears
    const bunnyGroup = new THREE.Group();

    const earGeometry = new THREE.ConeGeometry(0.3, 1.2, 32);
    const earMaterial = new THREE.MeshPhongMaterial({ color: 0xffb6c1 });

    const leftEar = new THREE.Mesh(earGeometry, earMaterial);
    leftEar.position.set(-0.7, 1.2, 0);
    leftEar.rotation.z = -0.3;
    bunnyGroup.add(leftEar);

    const rightEar = new THREE.Mesh(earGeometry, earMaterial);
    rightEar.position.set(0.7, 1.2, 0);
    rightEar.rotation.z = 0.3;
    bunnyGroup.add(rightEar);

    filterObjects.bunny = bunnyGroup;
    scene.add(bunnyGroup);
    bunnyGroup.visible = false;

    // Crown
    const crownGroup = new THREE.Group();

    const crownGeometry = new THREE.CylinderGeometry(0.9, 0.8, 0.4, 8);
    const crownMaterial = new THREE.MeshPhongMaterial({
        color: 0xffd700,
        shininess: 100
    });
    const crown = new THREE.Mesh(crownGeometry, crownMaterial);
    crown.position.y = 1;
    crownGroup.add(crown);

    // Jewels on crown
    const jewelGeometry = new THREE.SphereGeometry(0.1, 16, 16);
    const jewelMaterial = new THREE.MeshPhongMaterial({
        color: 0xff0000,
        shininess: 100
    });
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const jewel = new THREE.Mesh(jewelGeometry, jewelMaterial);
        jewel.position.set(
            Math.cos(angle) * 0.85,
            1.2,
            Math.sin(angle) * 0.85
        );
        crownGroup.add(jewel);
    }

    filterObjects.crown = crownGroup;
    scene.add(crownGroup);
    crownGroup.visible = false;
}

// Detect faces and apply filters
async function detectFaces() {
    const faces = await detector.estimateFaces(video, {
        flipHorizontal: false
    });

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (faces.length > 0) {
        const face = faces[0];

        // Draw facial landmarks if enabled
        if (showLandmarks) {
            drawFaceLandmarks(face);
        }

        // Apply filter if selected
        if (currentFilter !== 'none') {
            applyFilter(face);
        }
    }

    // Render Three.js scene
    renderer.render(scene, camera);

    // Continue loop
    animationId = requestAnimationFrame(detectFaces);
}

// Draw facial landmarks on canvas
function drawFaceLandmarks(face) {
    const keypoints = face.keypoints;

    // Draw all keypoints
    ctx.fillStyle = '#00ff00';
    keypoints.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
        ctx.fill();
    });

    // Draw eye landmarks in different color
    ctx.fillStyle = '#ff00ff';
    [33, 133, 160, 159, 158, 157, 173, 263, 362, 385, 386, 387, 388, 466].forEach(index => {
        if (keypoints[index]) {
            ctx.beginPath();
            ctx.arc(keypoints[index].x, keypoints[index].y, 3, 0, 2 * Math.PI);
            ctx.fill();
        }
    });

    // Draw nose tip in red
    ctx.fillStyle = '#ff0000';
    if (keypoints[1]) {
        ctx.beginPath();
        ctx.arc(keypoints[1].x, keypoints[1].y, 4, 0, 2 * Math.PI);
        ctx.fill();
    }
}

// Apply filter to detected face
function applyFilter(face) {
    if (!filterObjects[currentFilter]) return;

    const keypoints = face.keypoints;

    // Get face landmarks
    const nose = keypoints[1]; // Nose tip
    const leftEye = keypoints[33]; // Left eye
    const rightEye = keypoints[263]; // Right eye
    const forehead = keypoints[10]; // Forehead

    // Calculate face position and size
    const faceWidth = Math.abs(rightEye.x - leftEye.x);
    const faceCenterX = (leftEye.x + rightEye.x) / 2;
    const faceCenterY = (leftEye.y + rightEye.y) / 2;

    // Convert screen coordinates to Three.js coordinates
    const x = (faceCenterX / canvas.width) * 2 - 1;
    const y = -(faceCenterY / canvas.height) * 2 + 1;

    // Scale based on face width
    const scale = faceWidth / 100;

    // Update filter object
    const filter = filterObjects[currentFilter];
    filter.position.set(x * 5, y * 5, 0);
    filter.scale.set(scale, scale, scale);

    // Add slight rotation based on eye positions
    const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
    filter.rotation.z = -angle;

    // Adjust position for specific filters
    if (currentFilter === 'glasses') {
        filter.position.y += 0.2;
    } else if (currentFilter === 'bunny' || currentFilter === 'crown') {
        filter.position.y += 1.2;
    }
}

// Setup UI controls
function setupControls() {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active button
            buttons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Hide all filters
            Object.values(filterObjects).forEach(filter => {
                filter.visible = false;
            });

            // Show selected filter
            currentFilter = button.dataset.filter;
            if (currentFilter !== 'none' && filterObjects[currentFilter]) {
                filterObjects[currentFilter].visible = true;
            }
        });
    });

    // Setup landmarks toggle
    const landmarksCheckbox = document.getElementById('showLandmarks');
    if (landmarksCheckbox) {
        landmarksCheckbox.addEventListener('change', (e) => {
            showLandmarks = e.target.checked;
        });
    }
}

// Update status message
function updateStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
}

// Start the application
window.addEventListener('load', init);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
});
