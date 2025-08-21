// Chart data for August 2025
const chartData = [
    { date: '01-08', sadar: '93', gwalior: '41', delhiMatka: '48', shriGanesh: '20', agra: '59', faridabad: '23', alwar: '07', gaziyabad: '88', dwarka: '79', gali: '13', disawer: '--' },
    { date: '02-08', sadar: '74', gwalior: '81', delhiMatka: '93', shriGanesh: '27', agra: '44', faridabad: '80', alwar: '28', gaziyabad: '98', dwarka: '82', gali: '71', disawer: '68' },
    { date: '03-08', sadar: '71', gwalior: '86', delhiMatka: '92', shriGanesh: '95', agra: '78', faridabad: '00', alwar: '72', gaziyabad: '64', dwarka: '86', gali: '59', disawer: '56' },
    { date: '04-08', sadar: '96', gwalior: '54', delhiMatka: '64', shriGanesh: '40', agra: '71', faridabad: '22', alwar: '42', gaziyabad: '61', dwarka: '12', gali: '22', disawer: '92' },
    { date: '05-08', sadar: '53', gwalior: '94', delhiMatka: '43', shriGanesh: '17', agra: '03', faridabad: '14', alwar: '49', gaziyabad: '82', dwarka: '97', gali: '28', disawer: '56' },
    { date: '06-08', sadar: '02', gwalior: '39', delhiMatka: '81', shriGanesh: '98', agra: '22', faridabad: '66', alwar: '27', gaziyabad: '89', dwarka: '53', gali: '45', disawer: '85' },
    { date: '07-08', sadar: '85', gwalior: '06', delhiMatka: '18', shriGanesh: '39', agra: '36', faridabad: '71', alwar: '49', gaziyabad: '83', dwarka: '19', gali: '99', disawer: '21' },
    { date: '08-08', sadar: '94', gwalior: '75', delhiMatka: '71', shriGanesh: '28', agra: '23', faridabad: '14', alwar: '64', gaziyabad: '79', dwarka: '22', gali: '87', disawer: '89' },
    { date: '09-08', sadar: '84', gwalior: '35', delhiMatka: '92', shriGanesh: '83', agra: '06', faridabad: '84', alwar: '10', gaziyabad: '98', dwarka: '54', gali: '82', disawer: '61' },
    { date: '10-08', sadar: '01', gwalior: '66', delhiMatka: '45', shriGanesh: '17', agra: '12', faridabad: '26', alwar: '26', gaziyabad: '43', dwarka: '37', gali: '57', disawer: '31' },
    { date: '11-08', sadar: '69', gwalior: '81', delhiMatka: '33', shriGanesh: '32', agra: '88', faridabad: '37', alwar: '84', gaziyabad: '89', dwarka: '29', gali: '36', disawer: '57' },
    { date: '12-08', sadar: '83', gwalior: '33', delhiMatka: '64', shriGanesh: '33', agra: '63', faridabad: '12', alwar: '92', gaziyabad: '81', dwarka: '28', gali: '32', disawer: '87' },
    { date: '13-08', sadar: '13', gwalior: '71', delhiMatka: '59', shriGanesh: '38', agra: '72', faridabad: '73', alwar: '18', gaziyabad: '18', dwarka: '08', gali: '83', disawer: '01' },
    { date: '14-08', sadar: '93', gwalior: '70', delhiMatka: '13', shriGanesh: '01', agra: '61', faridabad: '62', alwar: '20', gaziyabad: '37', dwarka: '61', gali: '46', disawer: '27' },
    { date: '15-08', sadar: '37', gwalior: '63', delhiMatka: '05', shriGanesh: '72', agra: '85', faridabad: '87', alwar: '43', gaziyabad: '01', dwarka: '16', gali: '43', disawer: '16' },
    { date: '16-08', sadar: '83', gwalior: '27', delhiMatka: '70', shriGanesh: '51', agra: '62', faridabad: '50', alwar: '24', gaziyabad: '13', dwarka: '13', gali: '13', disawer: '13' },
    { date: '17-08', sadar: '--', gwalior: '--', delhiMatka: '--', shriGanesh: '--', agra: '--', faridabad: '--', alwar: '--', gaziyabad: '--', dwarka: '--', gali: '--', disawer: '--' },
    { date: '18-08', sadar: '--', gwalior: '--', delhiMatka: '--', shriGanesh: '--', agra: '--', faridabad: '--', alwar: '--', gaziyabad: '--', dwarka: '--', gali: '--', disawer: '--' }
];

// Update current time
function updateCurrentTime() {
        const now = new Date();
    const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        hour12: true
    };
    const timeString = now.toLocaleDateString('en-US', options);
    document.getElementById('current-time').textContent = timeString;
}

// Populate chart data (from backend if available)
async function populateChartData() {
    const chartTable = document.getElementById('chart-data');
    if (!chartTable) return;

    chartTable.innerHTML = '';
    try {
        const res = await fetch('/api/chart');
        if (res.ok) {
            const data = await res.json();
            const rows = Array.isArray(data.rows) ? data.rows : [];
            if (rows.length === 0) return;

            // Build column order: date first, then keys from first row (preserve appearance), then any extras
            const first = rows[0];
            const cols = [];
            if ('date' in first) cols.push('date');
            // collect other keys in order
            for (const k of Object.keys(first)){
                if (k === 'date') continue;
                cols.push(k);
            }
            // include any keys present in other rows but not in first
            for (const r of rows){
                for (const k of Object.keys(r)){
                    if (k === 'date') continue;
                    if (!cols.includes(k)) cols.push(k);
                }
            }

            // replace table header (if present) to match cols
            const table = chartTable.closest('table') || document.querySelector('.chart-table');
            if (table){
                const thead = table.querySelector('thead');
                if (thead){
                    const headRow = document.createElement('tr');
                    for (const c of cols){
                        const th = document.createElement('th');
                        th.textContent = c.toUpperCase();
                        headRow.appendChild(th);
                    }
                    thead.innerHTML = '';
                    thead.appendChild(headRow);
                }
            }

            // populate tbody
            chartTable.innerHTML = '';
            rows.forEach(row => {
                const tr = document.createElement('tr');
                const cells = cols.map(c => escapeHtml(row[c] ?? ''));
                tr.innerHTML = cells.map(v => `<td>${v}</td>`).join('');
                chartTable.appendChild(tr);
            });
            return;
        }
    } catch (e) {
        console.warn('Falling back to static chartData', e);
    }

    // Fallback to embedded data
        chartData.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.date}</td>
                <td>${row.sadar}</td>
                <td>${row.gwalior}</td>
            <td>${row.delhiMatka}</td>
            <td>${row.shriGanesh}</td>
                <td>${row.agra}</td>
                <td>${row.faridabad}</td>
                <td>${row.alwar}</td>
            <td>${row.gaziyabad}</td>
                <td>${row.dwarka}</td>
                <td>${row.gali}</td>
            <td>${row.disawer}</td>
        `;
        chartTable.appendChild(tr);
    });
}

// Update waiting results with animation
function updateWaitingResults() {
    const waitingElements = document.querySelectorAll('.waiting');
    waitingElements.forEach(element => {
        element.style.animation = 'pulse 1.5s infinite';
    });
}

// Smooth scrolling for navigation links
function initSmoothScrolling() {
    const navLinks = document.querySelectorAll('.nav-link');
    // Only attach smooth-scrolling to same-page/hash links.
    navLinks.forEach(link => {
        const href = link.getAttribute('href') || '';
        if (!href.startsWith('#')) return; // allow normal navigation for external/page links

        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = href.substring(1);
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Add hover effects to navigation links
function initNavHoverEffects() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
        });
        
        link.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });
}

// Add hover effects to market items
function initMarketHoverEffects() {
    const marketItems = document.querySelectorAll('.market-item');
    
    marketItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateX(5px)';
            this.style.boxShadow = '0 2px 8px rgba(231, 76, 60, 0.3)';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateX(0)';
            this.style.boxShadow = 'none';
        });
    });
}

// Add table row hover effects
function initTableHoverEffects() {
    const tableRows = document.querySelectorAll('.results-table tr, .chart-table tr');
    
    tableRows.forEach(row => {
        row.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#f8f9fa';
        });
        
        row.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '';
        });
    });
}

// Refresh button animation
function initRefreshButton() {
    const refreshBtn = document.querySelector('.btn-refresh');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            this.style.transform = 'rotate(360deg)';
            setTimeout(() => {
                this.style.transform = 'rotate(0deg)';
            }, 500);
        });
    }
}

// login removed

// Add form input focus effects
function initFormEffects() {
    const formInputs = document.querySelectorAll('.form-group input');
    
    formInputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.parentElement.style.transform = 'scale(1.02)';
        });
        
        input.addEventListener('blur', function() {
            this.parentElement.style.transform = 'scale(1)';
        });
    });
}

// Add scroll to top functionality
function initScrollToTop() {
    const homeLink = document.querySelector('a[href="#home"]');
    if (homeLink) {
        homeLink.addEventListener('click', function(e) {
            e.preventDefault();
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
}

// Add loading animation for chart data
function addChartLoadingAnimation() {
    const chartTable = document.getElementById('chart-data');
    if (chartTable) {
        chartTable.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 2rem; color: #e74c3c; font-weight: bold;">Loading chart data...</td></tr>';
        populateChartData();
    }
}

// Add notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
        color: white;
        padding: 1rem 2rem;
        border-radius: 5px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
            }, 3000);
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Update time immediately and then every second
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    // Populate chart data with loading animation
    addChartLoadingAnimation();
    
    // Update waiting results and load dynamic results table
    updateWaitingResults();
    loadResultsTable();

    // Nav handlers: home scrolls to top if we're on index, chart/contact open pages
    const homeBtn = document.querySelector('.nav-home');
    if (homeBtn){
        homeBtn.addEventListener('click', function(e){
            // if current path is root, scroll to top
            if (location.pathname === '/' || location.pathname.endsWith('/index.html')){
                e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }
    
    // Initialize all interactive features
    initSmoothScrolling();
    initNavHoverEffects();
    initMarketHoverEffects();
    initTableHoverEffects();
    initRefreshButton();
    initFormEffects();
    initScrollToTop();
    
    // Show welcome notification
    setTimeout(() => {
        showNotification('Welcome to A7 Satta King! 🎉', 'success');
    }, 1000);
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
    }
    
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .form-group {
        transition: transform 0.3s ease;
    }
    
    .btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }
`;
document.head.appendChild(style);

// Load results table from backend
async function loadResultsTable() {
    const tbody = document.getElementById('results-body');
    if (!tbody) return;
    // If the page already contains static market rows (from the HTML), don't overwrite them
    const hasStatic = tbody.querySelector('.market-cell');

    try {
    const res = await fetch('/api/latest');
        if (!res.ok) throw new Error('status ' + res.status);
        const json = await res.json();
        // API returns { data: rows }
        const rows = Array.isArray(json.data) ? json.data : [];

        if (rows.length > 0) {
            // group rows by game (preserve order of first appearance)
            const map = new Map();
            for (const r of rows) {
                const key = (r.game || '').trim();
                if (!key) continue;
                if (!map.has(key)) map.set(key, []);
                map.get(key).push(r);
            }

            tbody.innerHTML = '';
            for (const [game, items] of map.entries()){
                const current = items[0] || {};
                const prev = items[1] || {};
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div class="market-cell">
                            <div class="market-title">${escapeHtml(game)}</div>
                            <div class="market-time">${escapeHtml(current.result_time || '')}</div>
                        </div>
                    </td>
                    <td class="prev">${escapeHtml(prev.result || '--')}</td>
                    <td class="today">${current.result && current.result !== '--' ? escapeHtml(current.result) : '<img src="/static/img/wait.svg" class="wait-img" alt="wait">'}</td>
                `;
                tbody.appendChild(tr);
            }
        }
        // if API returns empty array, leave existing static rows intact
    } catch (e) {
        // API not available or failed: keep the static HTML rows (if any)
        if (!hasStatic) {
            // If there are no static rows, show a gentle loading message
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 1rem;">Loading...</td></tr>';
        }
        console.warn('Failed to load results from API — using static rows if present', e);
    }
}

// small helper to escape html when injecting strings
function escapeHtml(s){
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function(c){
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
}
