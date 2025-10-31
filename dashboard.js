// Global variables
let weightChart, spaceChart;
let alertSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-alarm-digital-clock-beep-989.mp3');

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    initializeCharts();
    loadDashboardData();
    setInterval(loadDashboardData, 3000); // Update every 3 seconds
});

// Initialize Chart.js charts
function initializeCharts() {
    const spaceCtx = document.getElementById('spaceChart').getContext('2d');
    spaceChart = new Chart(spaceCtx, {
        type: 'doughnut',
        data: {
            labels: ['Used Space', 'Free Space'],
            datasets: [{
                data: [30, 70],
                backgroundColor: ['#ff6384', '#36a2eb'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' },
                title: { display: true, text: 'Shelf 1 Space Utilization' }
            }
        }
    });

    const weightCtx = document.getElementById('weightChart').getContext('2d');
    weightChart = new Chart(weightCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Weight (kg)',
                data: [],
                borderColor: '#4bc0c0',
                tension: 0.1,
                fill: false
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Weight (kg)' } },
                x: { title: { display: true, text: 'Time' } }
            }
        }
    });
}

// Load dashboard data from API
async function loadDashboardData() {
    try {
        const response = await fetch('/api/dashboard_data');
        const data = await response.json();
        
        updateInventoryDisplay(data.sensor_data);
        updateCharts(data.sensor_data);
        updateAlertsDisplay(data.alerts);
        checkForSecurityAlerts(data.alerts);
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

// Update inventory cards
function updateInventoryDisplay(sensorData) {
    const container = document.getElementById('inventoryContainer');
    container.innerHTML = '';

    for (const [shelfId, data] of Object.entries(sensorData)) {
        const percentage = (data.weight / 10) * 100; // Assuming max weight 10kg
        let progressColor = 'bg-success';
        
        if (percentage < 20) progressColor = 'bg-danger';
        else if (percentage < 50) progressColor = 'bg-warning';

        const shelfCard = `
            <div class="col-md-4 mb-4">
                <div class="card shelf-card h-100">
                    <div class="card-header">
                        <h5 class="card-title mb-0">${shelfId.toUpperCase()}</h5>
                    </div>
                    <div class="card-body">
                        <div class="row mb-3">
                            <div class="col-6">
                                <strong>Weight:</strong><br>
                                <span class="h4">${data.weight.toFixed(2)} kg</span>
                            </div>
                            <div class="col-6">
                                <strong>Items:</strong><br>
                                <span class="h4">${data.items}</span>
                            </div>
                        </div>
                        <div class="progress" style="height: 25px;">
                            <div class="progress-bar ${progressColor}" role="progressbar" 
                                 style="width: ${percentage}%;" 
                                 aria-valuenow="${percentage}" 
                                 aria-valuemin="0" 
                                 aria-valuemax="100">
                                ${percentage.toFixed(1)}%
                            </div>
                        </div>
                        <div class="mt-2">
                            <small class="text-muted">Distance: ${data.distance} cm</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML += shelfCard;
    }
}

// Update charts with new data
function updateCharts(sensorData) {
    // Update space utilization chart
    const shelf1 = sensorData.shelf1;
    const usedSpace = 100 - Math.min(shelf1.distance, 100);
    spaceChart.data.datasets[0].data = [usedSpace, 100 - usedSpace];
    spaceChart.update();

    // Update weight chart
    const now = new Date().toLocaleTimeString();
    weightChart.data.labels.push(now);
    weightChart.data.datasets[0].data.push(shelf1.weight);
    
    // Keep only last 10 data points
    if (weightChart.data.labels.length > 10) {
        weightChart.data.labels.shift();
        weightChart.data.datasets[0].data.shift();
    }
    
    weightChart.update();
}

// Update alerts display
function updateAlertsDisplay(alerts) {
    const container = document.getElementById('alertsContainer');
    
    if (alerts.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No recent alerts</p>';
        return;
    }

    let alertsHTML = '';
    alerts.reverse().forEach(alert => {
        const alertClass = alert.type === 'security' ? 'danger' : 'warning';
        const icon = alert.type === 'security' ? 'fa-shield-alt' : 'fa-exclamation-triangle';
        
        alertsHTML += `
            <div class="alert alert-${alertClass} alert-dismissible fade show mb-2">
                <i class="fas ${icon} me-2"></i>
                <strong>${alert.type.toUpperCase()}:</strong> ${alert.message}
                <small class="text-muted ms-2">${alert.timestamp}</small>
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
    });
    
    container.innerHTML = alertsHTML;
}

// Check for and handle security alerts
function checkForSecurityAlerts(alerts) {
    const securityAlert = alerts.find(alert => alert.type === 'security' && 
        new Date() - new Date(alert.timestamp) < 60000); // Alerts from last minute
    
    const alertBanner = document.getElementById('securityAlert');
    
    if (securityAlert) {
        alertBanner.classList.remove('d-none');
        document.getElementById('alertMessage').textContent = securityAlert.message;
        
        // Play alert sound (only once)
        if (!alertSound.played) {
            alertSound.play().catch(e => console.log('Audio play failed:', e));
        }
    } else {
        alertBanner.classList.add('d-none');
        alertSound.pause();
        alertSound.currentTime = 0;
    }
}
