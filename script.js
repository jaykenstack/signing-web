// Firebase Configuration
// Replace with your Firebase config
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

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

// Days of the week
const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// Week dates
const week1Dates = {
    'Monday': '02/02/26',
    'Tuesday': '03/02/26',
    'Wednesday': '04/02/26',
    'Thursday': '05/02/26',
    'Friday': '06/02/26'
};

const week2Dates = {
    'Monday': '09/02/26',
    'Tuesday': '10/02/26',
    'Wednesday': '11/02/26',
    'Thursday': '12/02/26',
    'Friday': '13/02/26'
};

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    initializeCanvas();
    loadData();
    setupRealtimeListeners();
});

// Initialize signature canvas
function initializeCanvas() {
    canvas = document.getElementById('signatureCanvas');
    if (canvas) {
        ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Set canvas size
        resizeCanvas();
        
        // Event listeners for drawing
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseleave', stopDrawing);
        
        // Touch events for mobile
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startDrawing(e);
        });
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            draw(e);
        });
        canvas.addEventListener('touchend', stopDrawing);
    }
}

// Resize canvas
function resizeCanvas() {
    if (canvas) {
        const container = canvas.parentElement;
        canvas.width = container.clientWidth - 30;
        canvas.height = 200;
    }
}

// Drawing functions
function startDrawing(e) {
    isDrawing = true;
    const pos = getCanvasCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
}

function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    
    const pos = getCanvasCoordinates(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
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
    }
}

// Load data from Firestore
function loadData() {
    // Load workers
    db.collection('workers').orderBy('name').onSnapshot((snapshot) => {
        workers = [];
        snapshot.forEach((doc) => {
            workers.push({
                id: doc.id,
                ...doc.data()
            });
        });
        renderWorkers();
        renderAttendance();
    });

    // Load signatures
    db.collection('signatures').onSnapshot((snapshot) => {
        signatures = [];
        snapshot.forEach((doc) => {
            signatures.push({
                id: doc.id,
                ...doc.data()
            });
        });
        updateTotalSignatures();
        renderAttendance();
        updateProgress();
    });
}

// Setup realtime listeners
function setupRealtimeListeners() {
    db.collection('workers').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added' || change.type === 'modified' || change.type === 'removed') {
                console.log('Worker data changed:', change.type);
            }
        });
    });

    db.collection('signatures').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                showNotification('New signature added!');
            } else if (change.type === 'removed') {
                showNotification('Signature deleted!');
            }
        });
    });
}

// Show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #4CAF50, #45a049);
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        z-index: 2000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Render workers list
function renderWorkers() {
    const tableBody = document.getElementById('workersTableBody');
    const cardsContainer = document.getElementById('workersCards');
    
    if (!tableBody || !cardsContainer) return;
    
    tableBody.innerHTML = '';
    cardsContainer.innerHTML = '';
    
    workers.forEach((worker, index) => {
        // Table row
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${worker.name}</td>
            <td>${worker.nationalId}</td>
            <td>${worker.phone}</td>
            <td>
                <div class="action-btns">
                    <button class="delete-btn" onclick="deleteWorker('${worker.id}')">
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
                <button class="delete-btn" onclick="deleteWorker('${worker.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="worker-detail">
                <strong>Name:</strong> ${worker.name}
            </div>
            <div class="worker-detail">
                <strong>National ID:</strong> ${worker.nationalId}
            </div>
            <div class="worker-detail">
                <strong>Phone:</strong> ${worker.phone}
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
        let rowHtml = `<td><strong>${worker.name}</strong></td>`;
        
        daysOfWeek.forEach(day => {
            rowHtml += renderAttendanceCell(worker.id, day, 'week1');
        });
        
        row.innerHTML = rowHtml;
        tableBody.appendChild(row);
        
        // Mobile attendance card
        const card = document.createElement('div');
        card.className = 'attendance-card';
        let cardHtml = `<div class="worker-name">${worker.name}</div><div class="days-grid">`;
        
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
        let rowHtml = `<td><strong>${worker.name}</strong></td>`;
        
        daysOfWeek.forEach(day => {
            rowHtml += renderAttendanceCell(worker.id, day, 'week2');
        });
        
        row.innerHTML = rowHtml;
        tableBody.appendChild(row);
        
        // Mobile attendance card
        const card = document.createElement('div');
        card.className = 'attendance-card';
        let cardHtml = `<div class="worker-name">${worker.name}</div><div class="days-grid">`;
        
        daysOfWeek.forEach(day => {
            cardHtml += renderMobileAttendance(worker.id, day, 'week2');
        });
        
        cardHtml += '</div>';
        card.innerHTML = cardHtml;
        mobileContainer.appendChild(card);
    });
}

// Render attendance cell
function renderAttendanceCell(workerId, day, week) {
    const signature = signatures.find(s => 
        s.workerId === workerId && s.day === day && s.week === week
    );
    
    if (signature) {
        return `
            <td>
                <div class="signature-actions">
                    <button class="sign-btn signed" onclick="showSignature('${workerId}', '${day}', '${week}')">
                        <i class="fas fa-check"></i>
                    </button>
                    <div class="signature-preview-container">
                        <img src="${signature.data}" class="signature-preview" alt="Signature" 
                             onclick="showSignature('${workerId}', '${day}', '${week}')">
                        <button class="delete-signature-btn" onclick="openDeleteSignatureModal('${signature.id}', '${workerId}', '${day}', '${week}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </td>
        `;
    } else {
        return `
            <td>
                <button class="sign-btn" onclick="openSignatureModal('${workerId}', '${day}', '${week}')">
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
    
    if (signature) {
        return `
            <div class="mobile-day-row">
                <div class="mobile-day-info">
                    <span class="mobile-day-name">${day}</span>
                    <img src="${signature.data}" class="signature-preview" alt="Signature" 
                         onclick="showSignature('${workerId}', '${day}', '${week}')">
                </div>
                <div class="mobile-signature-actions">
                    <button class="sign-btn signed" onclick="showSignature('${workerId}', '${day}', '${week}')">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="delete-signature-btn" onclick="openDeleteSignatureModal('${signature.id}', '${workerId}', '${day}', '${week}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    } else {
        return `
            <div class="mobile-day-row">
                <span class="mobile-day-name">${day}</span>
                <button class="sign-btn" onclick="openSignatureModal('${workerId}', '${day}', '${week}')">
                    <i class="fas fa-pen"></i> Sign
                </button>
            </div>
        `;
    }
}

// Open signature modal
function openSignatureModal(workerId, day, week) {
    const worker = workers.find(w => w.id === workerId);
    if (!worker) return;
    
    currentSigning = { workerId, day, week };
    
    const modal = document.getElementById('signatureModal');
    const info = document.getElementById('signatureInfo');
    
    info.textContent = `Signing for ${worker.name} on ${day} (${week === 'week1' ? 'Week 1' : 'Week 2'})`;
    
    // Clear canvas
    clearSignature();
    
    modal.style.display = 'flex';
}

// Close signature modal
function closeSignatureModal() {
    document.getElementById('signatureModal').style.display = 'none';
    currentSigning = { workerId: null, day: null, week: null };
}

// Submit signature
async function submitSignature() {
    if (!currentSigning.workerId || !currentSigning.day) {
        alert('No signing session active');
        return;
    }
    
    // Get signature data
    const signatureData = canvas.toDataURL('image/png');
    
    // Create signature object
    const signature = {
        workerId: currentSigning.workerId,
        day: currentSigning.day,
        week: currentSigning.week,
        data: signatureData,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        // Check if signature already exists for this worker, day, and week
        const existingSignature = signatures.find(s => 
            s.workerId === currentSigning.workerId && 
            s.day === currentSigning.day && 
            s.week === currentSigning.week
        );
        
        if (existingSignature) {
            // Update existing signature
            await db.collection('signatures').doc(existingSignature.id).update({
                data: signatureData,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            showNotification('Signature updated successfully!');
        } else {
            // Add new signature
            await db.collection('signatures').add(signature);
            showNotification('Signature saved successfully!');
        }
        
        closeSignatureModal();
    } catch (error) {
        console.error('Error saving signature:', error);
        alert('Error saving signature. Please try again.');
    }
}

// Open delete signature modal
function openDeleteSignatureModal(signatureId, workerId, day, week) {
    const worker = workers.find(w => w.id === workerId);
    if (!worker) return;
    
    currentDeleteSignature = { signatureId, workerId, day, week };
    
    const modal = document.getElementById('deleteSignatureModal');
    const info = document.getElementById('deleteSignatureInfo');
    
    info.textContent = `Delete signature for ${worker.name} on ${day} (${week === 'week1' ? 'Week 1' : 'Week 2'})?`;
    
    modal.style.display = 'flex';
}

// Close delete signature modal
function closeDeleteSignatureModal() {
    document.getElementById('deleteSignatureModal').style.display = 'none';
    currentDeleteSignature = null;
}

// Confirm delete signature
async function confirmDeleteSignature() {
    if (!currentDeleteSignature) return;
    
    try {
        await db.collection('signatures').doc(currentDeleteSignature.signatureId).delete();
        closeDeleteSignatureModal();
        showNotification('Signature deleted successfully!');
    } catch (error) {
        console.error('Error deleting signature:', error);
        alert('Error deleting signature. Please try again.');
    }
}

// Show signature
function showSignature(workerId, day, week) {
    const signature = signatures.find(s => 
        s.workerId === workerId && s.day === day && s.week === week
    );
    
    if (signature) {
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
                    <p><strong>${worker ? worker.name : 'Unknown'}</strong></p>
                    <p>${day}</p>
                    <img src="${signature.data}" style="max-width: 100%; border: 1px solid #ddd; border-radius: 10px; margin-top: 15px;">
                    <div style="margin-top: 20px;">
                        <button class="delete-btn" onclick="openDeleteSignatureModal('${signature.id}', '${workerId}', '${day}', '${week}'); this.closest('.modal').remove();">
                            <i class="fas fa-trash"></i> Delete Signature
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

// Show add worker modal
function showAddWorkerModal() {
    document.getElementById('addWorkerModal').style.display = 'flex';
}

// Close add worker modal
function closeAddWorkerModal() {
    document.getElementById('addWorkerModal').style.display = 'none';
    document.getElementById('addWorkerForm').reset();
}

// Add worker
async function addWorker(event) {
    event.preventDefault();
    
    const name = document.getElementById('workerName').value;
    const nationalId = document.getElementById('workerNationalId').value;
    const phone = document.getElementById('workerPhone').value;
    
    // Check if worker already exists
    const existingWorker = workers.find(w => 
        w.nationalId === nationalId || w.phone === phone
    );
    
    if (existingWorker) {
        alert('A worker with this National ID or Phone number already exists!');
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
        alert('Error adding worker. Please try again.');
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
        for (const signature of workerSignatures) {
            await db.collection('signatures').doc(signature.id).delete();
        }
        
        showNotification('Worker deleted successfully!');
    } catch (error) {
        console.error('Error deleting worker:', error);
        alert('Error deleting worker. Please try again.');
    }
}

// Edit clerk name
function editClerkName() {
    const currentName = document.getElementById('clerkName').textContent;
    const newName = prompt('Enter Clerk of Works name:', currentName);
    
    if (newName && newName.trim()) {
        document.getElementById('clerkName').textContent = newName.trim();
    }
}

// Update total signatures
function updateTotalSignatures() {
    document.getElementById('totalSignatures').textContent = signatures.length;
}

// Update progress
function updateProgress() {
    const week1Signatures = signatures.filter(s => s.week === 'week1').length;
    const week2Signatures = signatures.filter(s => s.week === 'week2').length;
    
    // Calculate percentages (max 25 signatures per week - 5 workers * 5 days)
    const week1Percentage = (week1Signatures / 25) * 100;
    const week2Percentage = (week2Signatures / 25) * 100;
    
    // Update progress bars
    document.getElementById('week1Progress').style.width = `${week1Percentage}%`;
    document.getElementById('week2Progress').style.width = `${week2Percentage}%`;
    
    // Update counts
    document.getElementById('week1Count').textContent = `${week1Signatures}/25`;
    document.getElementById('week2Count').textContent = `${week2Signatures}/25`;
}

// Export to PDF - Updated to match Word document format
async function exportToPDF() {
    showNotification('Generating PDF report...');
    
    // Create a printable version of the report
    const printWindow = window.open('', '_blank');
    
    if (!printWindow) {
        alert('Please allow pop-ups to export PDF');
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
                padding: 10px;
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
                min-width: 80px;
            }
            .signature-image {
                max-width: 80px;
                max-height: 40px;
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
            }
            .overview-section textarea {
                width: 100%;
                min-height: 150px;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 5px;
                font-family: inherit;
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
                .print-btn {
                    display: none;
                }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>WAMUMU PI ESP</h1>
            <h3>CLERK OF WORKS: ${clerkName}</h3>
            <p>Total Signatures: ${signatures.length}</p>
        </div>
    `;
    
    // Add Week 1 table
    htmlContent += `
        <div class="week-section">
            <div class="week-title">WEEK 1 (2ND FEBRUARY - 6TH FEBRUARY 2026)</div>
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
                <td class="worker-name">${worker.name}</td>
                <td>${worker.nationalId}</td>
                <td>${worker.phone}</td>
        `;
        
        daysOfWeek.forEach(day => {
            const signature = signatures.find(s => 
                s.workerId === worker.id && s.day === day && s.week === 'week1'
            );
            
            if (signature) {
                htmlContent += `
                    <td class="signature-cell">
                        <img src="${signature.data}" class="signature-image" alt="Signature">
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
            <div class="week-title week2-title">WEEK 2 (9TH FEBRUARY - 13TH FEBRUARY 2026)</div>
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
                <td class="worker-name">${worker.name}</td>
                <td>${worker.nationalId}</td>
                <td>${worker.phone}</td>
        `;
        
        daysOfWeek.forEach(day => {
            const signature = signatures.find(s => 
                s.workerId === worker.id && s.day === day && s.week === 'week2'
            );
            
            if (signature) {
                htmlContent += `
                    <td class="signature-cell">
                        <img src="${signature.data}" class="signature-image" alt="Signature">
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
            <textarea placeholder="Enter overview, achievements, challenges, and recommendations..."></textarea>
        </div>
        
        <div class="footer">
            <h4>Summary</h4>
            <p><strong>Week 1 Signatures:</strong> ${signatures.filter(s => s.week === 'week1').length}/25</p>
            <p><strong>Week 2 Signatures:</strong> ${signatures.filter(s => s.week === 'week2').length}/25</p>
            <p><strong>Total Signatures:</strong> ${signatures.length}</p>
            <p><strong>Report Generated:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <div style="text-align: center; margin: 20px 0;">
            <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
        </div>
    </body>
    </html>
    `;
    
    // Write to new window
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    showNotification('PDF report generated successfully!');
}

// Window resize handler
window.addEventListener('resize', () => {
    resizeCanvas();
});