// Firebase Configuration
// Replace with your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCyTWZbqQI_zGKbFMujOvy6kE4d4D-5KXw",
  authDomain: "wamumu-attendance.firebaseapp.com",
  databaseURL: "https://wamumu-attendance-default-rtdb.firebaseio.com",
  projectId: "wamumu-attendance",
  storageBucket: "wamumu-attendance.firebasestorage.app",
  messagingSenderId: "809289925611",
  appId: "1:809289925611:web:3e11d0ff414e33043ccfae"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Enable persistence for offline support and better real-time sync
db.enablePersistence({ synchronizeTabs: true })
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.log('Persistence failed to enable');
        } else if (err.code == 'unimplemented') {
            console.log('Persistence not available');
        }
    });

// Global variables
let workers = [];
let signatures = [];
let currentSignatureData = null;
let currentSigning = {
    workerId: null,
    day: null,
    week: null
};
let currentDeleteSignature = null;
let canvas = null;
let ctx = null;
let isDrawing = false;
let drawingHistory = [];
let redoStack = [];

// Days of the week
const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    initializeCanvas();
    loadData();
    setupRealtimeListeners();
    checkMobileDevice();
    setupOfflineSupport();
    loadClerkName();
    
    // Add click event listeners to all sign buttons dynamically
    document.addEventListener('click', function(e) {
        if (e.target.closest('.sign-btn')) {
            const btn = e.target.closest('.sign-btn');
            if (!btn.classList.contains('signed')) {
                const workerId = btn.getAttribute('data-worker-id');
                const day = btn.getAttribute('data-day');
                const week = btn.getAttribute('data-week');
                if (workerId && day && week) {
                    openSignatureModal(workerId, day, week);
                }
            }
        }
    });
});

// Check if device is mobile
function checkMobileDevice() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
        document.body.classList.add('mobile-device');
        // Optimize canvas for touch
        if (canvas) {
            canvas.style.touchAction = 'none';
        }
    }
}

// Setup offline support
function setupOfflineSupport() {
    window.addEventListener('online', () => {
        showNotification('Back online - Syncing data...');
    });
    
    window.addEventListener('offline', () => {
        showNotification('You are offline - Changes will sync when connection resumes', 'warning');
    });
}

// Initialize signature canvas with mobile optimization
function initializeCanvas() {
    canvas = document.getElementById('signatureCanvas');
    if (canvas) {
        console.log('Canvas initialized');
        ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Set canvas size based on device
        resizeCanvas();
        
        // Event listeners for drawing (mouse)
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseleave', stopDrawing);
        
        // Touch events for mobile
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd);
        canvas.addEventListener('touchcancel', handleTouchEnd);
        
        // Prevent scrolling when drawing on mobile
        canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    } else {
        console.error('Canvas element not found');
    }
}

// Handle touch start
function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
}

// Handle touch move
function handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
}

// Handle touch end
function handleTouchEnd(e) {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {});
    canvas.dispatchEvent(mouseEvent);
}

// Resize canvas responsively
function resizeCanvas() {
    if (canvas) {
        const container = canvas.parentElement;
        const containerWidth = container.clientWidth - 30;
        const containerHeight = window.innerHeight > 600 ? 200 : 150;
        
        canvas.width = Math.min(containerWidth, 500);
        canvas.height = containerHeight;
        
        // Redraw signature if exists
        if (drawingHistory.length > 0) {
            redrawCanvas();
        }
    }
}

// Redraw canvas from history
function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawingHistory.forEach(point => {
        if (point.type === 'draw') {
            ctx.beginPath();
            ctx.moveTo(point.x1, point.y1);
            ctx.lineTo(point.x2, point.y2);
            ctx.stroke();
        }
    });
}

// Drawing functions with history
function startDrawing(e) {
    isDrawing = true;
    const pos = getCanvasCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    
    // Start new drawing path in history
    drawingHistory.push({
        type: 'start',
        x: pos.x,
        y: pos.y
    });
}

function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    
    const pos = getCanvasCoordinates(e);
    
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    
    // Store drawing point
    if (drawingHistory.length > 0) {
        const lastPoint = drawingHistory[drawingHistory.length - 1];
        drawingHistory.push({
            type: 'draw',
            x1: lastPoint.type === 'draw' ? lastPoint.x2 : lastPoint.x,
            y1: lastPoint.type === 'draw' ? lastPoint.y2 : lastPoint.y,
            x2: pos.x,
            y2: pos.y
        });
    }
    
    // Clear redo stack on new drawing
    redoStack = [];
}

function stopDrawing() {
    isDrawing = false;
    ctx.beginPath();
}

function getCanvasCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    
    if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

// Clear signature
function clearSignature() {
    if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawingHistory = [];
        redoStack = [];
    }
}

// Load data from Firestore with real-time listeners
function loadData() {
    console.log('Loading data from Firebase...');
    
    // Load workers with real-time listener
    db.collection('workers').orderBy('name').onSnapshot((snapshot) => {
        workers = [];
        snapshot.forEach((doc) => {
            workers.push({
                id: doc.id,
                ...doc.data()
            });
        });
        console.log('Workers loaded:', workers.length);
        renderWorkers();
        renderAttendance();
        updateProgress();
    }, (error) => {
        console.error('Error loading workers:', error);
        showNotification('Error loading workers. Please refresh.', 'error');
    });

    // Load signatures with real-time listener
    db.collection('signatures').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                showNotification('New signature added!', 'success');
            } else if (change.type === 'modified') {
                showNotification('Signature updated!', 'info');
            } else if (change.type === 'removed') {
                showNotification('Signature deleted!', 'warning');
            }
        });
        
        signatures = [];
        snapshot.forEach((doc) => {
            signatures.push({
                id: doc.id,
                ...doc.data()
            });
        });
        console.log('Signatures loaded:', signatures.length);
        updateTotalSignatures();
        renderAttendance();
        updateProgress();
    }, (error) => {
        console.error('Error loading signatures:', error);
        showNotification('Error loading signatures. Please refresh.', 'error');
    });
}

// Setup realtime listeners for cross-device sync
function setupRealtimeListeners() {
    // Listen for changes in workers collection
    db.collection('workers').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                console.log('Worker added on another device');
            } else if (change.type === 'modified') {
                console.log('Worker modified on another device');
            } else if (change.type === 'removed') {
                console.log('Worker removed on another device');
            }
        });
    });
}

// Show notification with different types
function showNotification(message, type = 'success') {
    const colors = {
        success: 'linear-gradient(135deg, #4CAF50, #45a049)',
        error: 'linear-gradient(135deg, #f44336, #d32f2f)',
        warning: 'linear-gradient(135deg, #ff9800, #f57c00)',
        info: 'linear-gradient(135deg, #2196F3, #1976D2)'
    };
    
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type] || colors.success};
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        z-index: 2000;
        animation: slideIn 0.3s ease;
        max-width: 90%;
        word-wrap: break-word;
        font-size: 14px;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Render workers list with mobile optimization
function renderWorkers() {
    const tableBody = document.getElementById('workersTableBody');
    const cardsContainer = document.getElementById('workersCards');
    
    if (!tableBody || !cardsContainer) return;
    
    tableBody.innerHTML = '';
    cardsContainer.innerHTML = '';
    
    workers.forEach((worker, index) => {
        // Table row for desktop
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${escapeHtml(worker.name)}</td>
            <td>${escapeHtml(worker.nationalId)}</td>
            <td>${escapeHtml(worker.phone)}</td>
            <td>
                <div class="action-btns">
                    <button class="delete-btn" onclick="deleteWorker('${worker.id}')" aria-label="Delete worker">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
        
        // Card for mobile
        const card = document.createElement('div');
        card.className = 'worker-card';
        card.innerHTML = `
            <div class="worker-card-header">
                <span class="worker-number">${index + 1}</span>
                <button class="delete-btn" onclick="deleteWorker('${worker.id}')" aria-label="Delete worker">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="worker-detail">
                <strong>Name:</strong> <span>${escapeHtml(worker.name)}</span>
            </div>
            <div class="worker-detail">
                <strong>National ID:</strong> <span>${escapeHtml(worker.nationalId)}</span>
            </div>
            <div class="worker-detail">
                <strong>Phone:</strong> <span>${escapeHtml(worker.phone)}</span>
            </div>
        `;
        cardsContainer.appendChild(card);
    });
}

// Render attendance for both weeks
function renderAttendance() {
    renderWeek1Attendance();
    renderWeek2Attendance();
}

// Render Week 1 attendance
function renderWeek1Attendance() {
    const tableBody = document.getElementById('attendanceTableBodyWeek1');
    const mobileContainer = document.getElementById('mobileAttendanceWeek1');
    
    if (!tableBody || !mobileContainer) return;
    
    tableBody.innerHTML = '';
    mobileContainer.innerHTML = '';
    
    workers.forEach((worker) => {
        // Desktop table row
        const row = document.createElement('tr');
        let rowHtml = `<td class="worker-name-cell"><strong>${escapeHtml(worker.name)}</strong></td>`;
        
        daysOfWeek.forEach(day => {
            rowHtml += renderAttendanceCell(worker.id, day, 'week1');
        });
        
        row.innerHTML = rowHtml;
        tableBody.appendChild(row);
        
        // Mobile attendance card
        const card = document.createElement('div');
        card.className = 'attendance-card';
        let cardHtml = `<div class="worker-name">${escapeHtml(worker.name)}</div><div class="days-grid">`;
        
        daysOfWeek.forEach(day => {
            cardHtml += renderMobileAttendance(worker.id, day, 'week1');
        });
        
        cardHtml += '</div>';
        card.innerHTML = cardHtml;
        mobileContainer.appendChild(card);
    });
}

// Render Week 2 attendance
function renderWeek2Attendance() {
    const tableBody = document.getElementById('attendanceTableBodyWeek2');
    const mobileContainer = document.getElementById('mobileAttendanceWeek2');
    
    if (!tableBody || !mobileContainer) return;
    
    tableBody.innerHTML = '';
    mobileContainer.innerHTML = '';
    
    workers.forEach((worker) => {
        // Desktop table row
        const row = document.createElement('tr');
        let rowHtml = `<td class="worker-name-cell"><strong>${escapeHtml(worker.name)}</strong></td>`;
        
        daysOfWeek.forEach(day => {
            rowHtml += renderAttendanceCell(worker.id, day, 'week2');
        });
        
        row.innerHTML = rowHtml;
        tableBody.appendChild(row);
        
        // Mobile attendance card
        const card = document.createElement('div');
        card.className = 'attendance-card';
        let cardHtml = `<div class="worker-name">${escapeHtml(worker.name)}</div><div class="days-grid">`;
        
        daysOfWeek.forEach(day => {
            cardHtml += renderMobileAttendance(worker.id, day, 'week2');
        });
        
        cardHtml += '</div>';
        card.innerHTML = cardHtml;
        mobileContainer.appendChild(card);
    });
}

// Render attendance cell for desktop
function renderAttendanceCell(workerId, day, week) {
    const signature = signatures.find(s => 
        s.workerId === workerId && s.day === day && s.week === week
    );
    
    if (signature && signature.data) {
        return `
            <td class="signature-cell">
                <div class="signature-actions">
                    <div class="signature-preview-container">
                        <img src="${signature.data}" class="signature-preview" alt="Signature" 
                             onclick="showSignature('${workerId}', '${day}', '${week}')"
                             loading="lazy">
                        <button class="delete-signature-btn" onclick="openDeleteSignatureModal('${signature.id}', '${workerId}', '${day}', '${week}')" 
                                aria-label="Delete signature">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </td>
        `;
    } else {
        return `
            <td>
                <button class="sign-btn" data-worker-id="${workerId}" data-day="${day}" data-week="${week}">
                    <i class="fas fa-pen"></i> Sign
                </button>
            </td>
        `;
    }
}

// Render mobile attendance
function renderMobileAttendance(workerId, day, week) {
    const signature = signatures.find(s => 
        s.workerId === workerId && s.day === day && s.week === week
    );
    
    if (signature && signature.data) {
        return `
            <div class="mobile-day-row">
                <div class="mobile-day-info">
                    <span class="mobile-day-name">${day}</span>
                    <img src="${signature.data}" class="signature-preview" alt="Signature" 
                         onclick="showSignature('${workerId}', '${day}', '${week}')"
                         loading="lazy">
                </div>
                <div class="mobile-signature-actions">
                    <button class="delete-signature-btn" onclick="openDeleteSignatureModal('${signature.id}', '${workerId}', '${day}', '${week}')" 
                            aria-label="Delete signature">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    } else {
        return `
            <div class="mobile-day-row">
                <span class="mobile-day-name">${day}</span>
                <button class="sign-btn" data-worker-id="${workerId}" data-day="${day}" data-week="${week}">
                    <i class="fas fa-pen"></i> Sign
                </button>
            </div>
        `;
    }
}

// Open signature modal with mobile optimization
function openSignatureModal(workerId, day, week) {
    console.log('Opening signature modal for:', { workerId, day, week });
    
    const worker = workers.find(w => w.id === workerId);
    if (!worker) {
        console.error('Worker not found:', workerId);
        return;
    }
    
    currentSigning = { workerId, day, week };
    
    const modal = document.getElementById('signatureModal');
    const info = document.getElementById('signatureInfo');
    
    if (!modal || !info) {
        console.error('Modal elements not found');
        return;
    }
    
    info.textContent = `Signing for ${worker.name} on ${day} (${week === 'week1' ? 'Week 1' : 'Week 2'})`;
    
    // Clear canvas
    clearSignature();
    
    modal.style.display = 'flex';
    
    // Focus on canvas for mobile
    setTimeout(() => {
        if (canvas) {
            canvas.focus();
        }
    }, 300);
}

// Close signature modal
function closeSignatureModal() {
    const modal = document.getElementById('signatureModal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentSigning = { workerId: null, day: null, week: null };
    clearSignature();
}

// Submit signature with real-time sync
async function submitSignature() {
    console.log('Submitting signature...', currentSigning);
    
    if (!currentSigning.workerId || !currentSigning.day) {
        alert('No signing session active');
        return;
    }
    
    // Check if canvas is empty
    const isEmpty = drawingHistory.length === 0;
    if (isEmpty) {
        if (!confirm('No signature drawn. Submit empty?')) {
            return;
        }
    }
    
    // Get signature data
    const signatureData = isEmpty ? '' : canvas.toDataURL('image/png');
    
    // Create signature object
    const signature = {
        workerId: currentSigning.workerId,
        day: currentSigning.day,
        week: currentSigning.week,
        data: signatureData,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        deviceInfo: navigator.userAgent,
        lastModified: new Date().toISOString()
    };
    
    try {
        // Check if signature already exists
        const existingSignature = signatures.find(s => 
            s.workerId === currentSigning.workerId && 
            s.day === currentSigning.day && 
            s.week === currentSigning.week
        );
        
        if (existingSignature) {
            // Update existing signature
            await db.collection('signatures').doc(existingSignature.id).update(signature);
            showNotification('Signature updated successfully!');
        } else {
            // Add new signature
            await db.collection('signatures').add(signature);
            showNotification('Signature saved successfully!');
        }
        
        closeSignatureModal();
    } catch (error) {
        console.error('Error saving signature:', error);
        showNotification('Error saving signature. Please try again.', 'error');
    }
}

// Open delete signature modal
function openDeleteSignatureModal(signatureId, workerId, day, week) {
    console.log('Opening delete modal for:', { signatureId, workerId, day, week });
    
    const worker = workers.find(w => w.id === workerId);
    if (!worker) return;
    
    currentDeleteSignature = { signatureId, workerId, day, week };
    
    const modal = document.getElementById('deleteSignatureModal');
    const info = document.getElementById('deleteSignatureInfo');
    
    if (!modal || !info) return;
    
    info.textContent = `Delete signature for ${worker.name} on ${day} (${week === 'week1' ? 'Week 1' : 'Week 2'})?`;
    
    modal.style.display = 'flex';
}

// Close delete signature modal
function closeDeleteSignatureModal() {
    const modal = document.getElementById('deleteSignatureModal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentDeleteSignature = null;
}

// Confirm delete signature
async function confirmDeleteSignature() {
    if (!currentDeleteSignature) return;
    
    try {
        await db.collection('signatures').doc(currentDeleteSignature.signatureId).delete();
        closeDeleteSignatureModal();
        showNotification('Signature deleted successfully!', 'warning');
    } catch (error) {
        console.error('Error deleting signature:', error);
        showNotification('Error deleting signature. Please try again.', 'error');
    }
}

// Show signature
function showSignature(workerId, day, week) {
    console.log('Showing signature for:', { workerId, day, week });
    
    const signature = signatures.find(s => 
        s.workerId === workerId && s.day === day && s.week === week
    );
    
    if (signature && signature.data) {
        const worker = workers.find(w => w.id === workerId);
        const weekName = week === 'week1' ? 'Week 1' : 'Week 2';
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Signature - ${weekName}</h3>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body" style="text-align: center;">
                    <p><strong>${worker ? escapeHtml(worker.name) : 'Unknown'}</strong></p>
                    <p>${day}</p>
                    <img src="${signature.data}" style="max-width: 100%; max-height: 200px; border: 1px solid #ddd; border-radius: 10px; margin: 15px 0;" alt="Signature">
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button class="delete-btn" onclick="openDeleteSignatureModal('${signature.id}', '${workerId}', '${day}', '${week}'); this.closest('.modal').remove();">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                        <button class="close-btn" onclick="this.closest('.modal').remove()" style="background: #666;">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

// Show add worker modal
function showAddWorkerModal() {
    const modal = document.getElementById('addWorkerModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// Close add worker modal
function closeAddWorkerModal() {
    const modal = document.getElementById('addWorkerModal');
    if (modal) {
        modal.style.display = 'none';
    }
    document.getElementById('addWorkerForm').reset();
}

// Add worker with real-time sync
async function addWorker(event) {
    event.preventDefault();
    
    const name = document.getElementById('workerName').value.trim();
    const nationalId = document.getElementById('workerNationalId').value.trim();
    const phone = document.getElementById('workerPhone').value.trim();
    
    if (!name || !nationalId || !phone) {
        showNotification('Please fill all fields', 'error');
        return;
    }
    
    // Check if worker already exists
    const existingWorker = workers.find(w => 
        w.nationalId === nationalId || w.phone === phone
    );
    
    if (existingWorker) {
        showNotification('Worker with this National ID or Phone already exists!', 'error');
        return;
    }
    
    const worker = {
        name,
        nationalId,
        phone,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        await db.collection('workers').add(worker);
        closeAddWorkerModal();
        showNotification('Worker added successfully!');
    } catch (error) {
        console.error('Error adding worker:', error);
        showNotification('Error adding worker. Please try again.', 'error');
    }
}

// Delete worker
async function deleteWorker(workerId) {
    if (!confirm('Are you sure you want to delete this worker? This will also delete all their signatures.')) {
        return;
    }
    
    try {
        // Delete worker
        await db.collection('workers').doc(workerId).delete();
        
        // Delete all signatures for this worker
        const workerSignatures = signatures.filter(s => s.workerId === workerId);
        const deletePromises = workerSignatures.map(s => 
            db.collection('signatures').doc(s.id).delete()
        );
        
        await Promise.all(deletePromises);
        
        showNotification('Worker deleted successfully!', 'warning');
    } catch (error) {
        console.error('Error deleting worker:', error);
        showNotification('Error deleting worker. Please try again.', 'error');
    }
}

// Edit clerk name
function editClerkName() {
    const currentName = document.getElementById('clerkName').textContent;
    const newName = prompt('Enter Clerk of Works name:', currentName);
    
    if (newName && newName.trim()) {
        document.getElementById('clerkName').textContent = newName.trim();
        // Save to localStorage for persistence
        localStorage.setItem('clerkName', newName.trim());
    }
}

// Load saved clerk name
function loadClerkName() {
    const savedName = localStorage.getItem('clerkName');
    if (savedName) {
        document.getElementById('clerkName').textContent = savedName;
    }
}

// Update total signatures
function updateTotalSignatures() {
    const totalElement = document.getElementById('totalSignatures');
    if (totalElement) {
        totalElement.textContent = signatures.length;
    }
}

// Update progress
function updateProgress() {
    const week1Signatures = signatures.filter(s => s.week === 'week1').length;
    const week2Signatures = signatures.filter(s => s.week === 'week2').length;
    
    // Calculate percentages (max 25 signatures per week - 5 workers * 5 days)
    const week1Percentage = (week1Signatures / 25) * 100;
    const week2Percentage = (week2Signatures / 25) * 100;
    
    // Update progress bars
    const week1Progress = document.getElementById('week1Progress');
    const week2Progress = document.getElementById('week2Progress');
    
    if (week1Progress) {
        week1Progress.style.width = `${week1Percentage}%`;
        week1Progress.setAttribute('aria-valuenow', week1Percentage);
    }
    
    if (week2Progress) {
        week2Progress.style.width = `${week2Percentage}%`;
        week2Progress.setAttribute('aria-valuenow', week2Percentage);
    }
    
    // Update counts
    const week1Count = document.getElementById('week1Count');
    const week2Count = document.getElementById('week2Count');
    
    if (week1Count) {
        week1Count.textContent = `${week1Signatures}/25`;
    }
    
    if (week2Count) {
        week2Count.textContent = `${week2Signatures}/25`;
    }
}

// Export to PDF without dates
async function exportToPDF() {
    showNotification('Generating PDF report...', 'info');
    
    // Create a printable version of the report
    const printWindow = window.open('', '_blank');
    
    if (!printWindow) {
        showNotification('Please allow pop-ups to export PDF', 'error');
        return;
    }
    
    // Get clerk name
    const clerkName = document.getElementById('clerkName').textContent;
    
    // Generate HTML content for PDF
    let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>WAMUMU PI ESP - Attendance Report</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 20px;
                padding: 0;
                background: white;
            }
            .header {
                text-align: center;
                margin-bottom: 20px;
                padding: 15px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-radius: 5px;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
            }
            .header h3 {
                margin: 5px 0 0;
                font-weight: normal;
            }
            .week-section {
                margin: 30px 0;
                page-break-inside: avoid;
            }
            .week-title {
                background: #f0f0f0;
                padding: 10px;
                margin: 20px 0 10px;
                font-weight: bold;
                border-left: 5px solid #667eea;
                font-size: 16px;
            }
            .week2-title {
                border-left-color: #ff6b6b;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
                font-size: 12px;
            }
            th {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 8px;
                text-align: center;
                font-weight: bold;
            }
            .week2-header th {
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5253 100%);
            }
            td {
                border: 1px solid #ddd;
                padding: 8px;
                vertical-align: middle;
            }
            .worker-name {
                font-weight: bold;
                background: #f9f9f9;
            }
            .signature-cell {
                text-align: center;
                min-width: 60px;
            }
            .signature-image {
                max-width: 60px;
                max-height: 30px;
                border: 1px solid #ccc;
                border-radius: 3px;
            }
            .empty-signature {
                color: #999;
                font-style: italic;
            }
            .footer {
                margin-top: 30px;
                padding: 20px;
                background: #f9f9f9;
                border-radius: 5px;
            }
            .footer h4 {
                margin: 0 0 10px;
                color: #333;
            }
            .footer p {
                margin: 5px 0;
                color: #666;
            }
            .overview-section {
                margin-top: 30px;
                padding: 20px;
                border: 1px solid #ddd;
                border-radius: 5px;
            }
            .overview-section h3 {
                margin-top: 0;
                color: #333;
                font-size: 14px;
            }
            .overview-section textarea {
                width: 100%;
                min-height: 120px;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 5px;
                font-family: inherit;
                font-size: 12px;
            }
            .print-btn {
                margin: 20px 0;
                padding: 10px 20px;
                background: #4CAF50;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
            }
            .print-btn:hover {
                background: #45a049;
            }
            @media print {
                .print-btn, .no-print {
                    display: none;
                }
                body {
                    margin: 0.5in;
                }
            }
            @media (max-width: 768px) {
                table {
                    font-size: 10px;
                }
                td, th {
                    padding: 4px;
                }
                .signature-image {
                    max-width: 40px;
                    max-height: 20px;
                }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>WAMUMU PI ESP</h1>
            <h3>CLERK OF WORKS: ${escapeHtml(clerkName)}</h3>
            <p>Total Signatures: ${signatures.length}</p>
        </div>
    `;
    
    // Add Week 1 table
    htmlContent += `
        <div class="week-section">
            <div class="week-title">WEEK 1</div>
            <table>
                <thead>
                    <tr>
                        <th>NAME</th>
                        <th>NATIONAL ID</th>
                        <th>PHONE NUMBER</th>
                        <th>MONDAY</th>
                        <th>TUESDAY</th>
                        <th>WEDNESDAY</th>
                        <th>THURSDAY</th>
                        <th>FRIDAY</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Add Week 1 data rows
    workers.forEach(worker => {
        htmlContent += `
            <tr>
                <td class="worker-name">${escapeHtml(worker.name)}</td>
                <td>${escapeHtml(worker.nationalId)}</td>
                <td>${escapeHtml(worker.phone)}</td>
        `;
        
        daysOfWeek.forEach(day => {
            const signature = signatures.find(s => 
                s.workerId === worker.id && s.day === day && s.week === 'week1'
            );
            
            if (signature && signature.data) {
                htmlContent += `
                    <td class="signature-cell">
                        <img src="${signature.data}" class="signature-image" alt="Signature" loading="lazy">
                    </td>
                `;
            } else {
                htmlContent += `
                    <td class="signature-cell empty-signature">—</td>
                `;
            }
        });
        
        htmlContent += `</tr>`;
    });
    
    htmlContent += `
                </tbody>
            </table>
        </div>
    `;
    
    // Add Week 2 table
    htmlContent += `
        <div class="week-section">
            <div class="week-title week2-title">WEEK 2</div>
            <table>
                <thead>
                    <tr class="week2-header">
                        <th>NAME</th>
                        <th>NATIONAL ID</th>
                        <th>PHONE NUMBER</th>
                        <th>MONDAY</th>
                        <th>TUESDAY</th>
                        <th>WEDNESDAY</th>
                        <th>THURSDAY</th>
                        <th>FRIDAY</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Add Week 2 data rows
    workers.forEach(worker => {
        htmlContent += `
            <tr>
                <td class="worker-name">${escapeHtml(worker.name)}</td>
                <td>${escapeHtml(worker.nationalId)}</td>
                <td>${escapeHtml(worker.phone)}</td>
        `;
        
        daysOfWeek.forEach(day => {
            const signature = signatures.find(s => 
                s.workerId === worker.id && s.day === day && s.week === 'week2'
            );
            
            if (signature && signature.data) {
                htmlContent += `
                    <td class="signature-cell">
                        <img src="${signature.data}" class="signature-image" alt="Signature" loading="lazy">
                    </td>
                `;
            } else {
                htmlContent += `
                    <td class="signature-cell empty-signature">—</td>
                `;
            }
        });
        
        htmlContent += `</tr>`;
    });
    
    htmlContent += `
                </tbody>
            </table>
        </div>
    `;
    
    // Add Overview section
    htmlContent += `
        <div class="overview-section">
            <h3>OVERVIEW OF ACTIVITIES, ACHIEVEMENTS, ANY CHALLENGES FACED AND RECOMMENDATIONS:</h3>
            <textarea placeholder="Enter overview, achievements, challenges, and recommendations..." class="overview-text"></textarea>
        </div>
        
        <div class="footer">
            <h4>Summary</h4>
            <p><strong>Week 1 Signatures:</strong> ${signatures.filter(s => s.week === 'week1').length}/25</p>
            <p><strong>Week 2 Signatures:</strong> ${signatures.filter(s => s.week === 'week2').length}/25</p>
            <p><strong>Total Signatures:</strong> ${signatures.length}</p>
            <p><strong>Report Generated:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="no-print" style="text-align: center; margin: 20px 0;">
            <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
        </div>
    </body>
    </html>
    `;
    
    // Write to new window
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    showNotification('PDF report generated successfully!', 'success');
}

// Window resize handler with debounce
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        resizeCanvas();
    }, 250);
});

// Make functions globally available
window.openSignatureModal = openSignatureModal;
window.closeSignatureModal = closeSignatureModal;
window.submitSignature = submitSignature;
window.clearSignature = clearSignature;
window.openDeleteSignatureModal = openDeleteSignatureModal;
window.closeDeleteSignatureModal = closeDeleteSignatureModal;
window.confirmDeleteSignature = confirmDeleteSignature;
window.showSignature = showSignature;
window.showAddWorkerModal = showAddWorkerModal;
window.closeAddWorkerModal = closeAddWorkerModal;
window.addWorker = addWorker;
window.deleteWorker = deleteWorker;
window.editClerkName = editClerkName;
window.exportToPDF = exportToPDF;