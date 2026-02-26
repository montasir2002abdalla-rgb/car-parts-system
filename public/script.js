// تعريف base URL للـ API (يستخدم نفس الخادم)
const API_BASE = window.location.origin; // أو يمكن تحديد الرابط الثابت: 'https://car-parts-system-fg2l.onrender.com'

let items = [];
let sellItems = [];
let buyItems = [];
let shipments = [];
let dashboardChart, profitChart;

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const username = document.getElementById('username').value;

    try {
        const res = await fetch(API_BASE + '/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('loginContainer').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            await loadItems();
            await loadShipments();
            await loadDashboard();
            await loadProfit();
            await loadReports();
            await loadLowStock();
            checkLowStockNotification();
        } else {
            alert(data.error || 'خطأ في تسجيل الدخول');
        }
    } catch (error) {
        alert('فشل الاتصال بالخادم: ' + error.message);
    }
});

function logout() {
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('password').value = '';
}

function goBack() {
    showSection('dashboard');
}

function hideNotification() {
    document.getElementById('notificationBar').style.display = 'none';
}

function checkLowStockNotification() {
    const lowStock = items.filter(i => i.quantity <= i.minStock);
    if (lowStock.length > 0) {
        document.getElementById('notificationMessage').innerText = `تنبيه: يوجد ${lowStock.length} صنف منخفض المخزون`;
        document.getElementById('notificationBar').style.display = 'flex';
    } else {
        document.getElementById('notificationBar').style.display = 'none';
    }
}

function showSection(section) {
    document.querySelectorAll('.sidebar-menu li').forEach(li => li.classList.remove('active'));
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));

    const titleMap = {
        dashboard: 'الرئيسية',
        items: 'إدارة الأصناف',
        sell: 'تسجيل بيع',
        buy: 'تسجيل شراء',
        profit: 'الأرباح',
        lowstock: 'المخزون المنخفض',
        shipments: 'الإرساليات',
        reports: 'التقارير المالية'
    };

    document.getElementById('sectionTitle').innerText = titleMap[section] || 'الرئيسية';

    if (section === 'dashboard') {
        document.getElementById('sectionHeader').style.display = 'none';
    } else {
        document.getElementById('sectionHeader').style.display = 'flex';
    }

    if (section === 'dashboard') {
        document.querySelector('.sidebar-menu li:nth-child(1)').classList.add('active');
        document.getElementById('dashboardSection').classList.add('active');
        loadDashboard();
    } else if (section === 'items') {
        document.querySelector('.sidebar-menu li:nth-child(2)').classList.add('active');
        document.getElementById('itemsSection').classList.add('active');
        loadItems();
    } else if (section === 'sell') {
        document.querySelector('.sidebar-menu li:nth-child(3)').classList.add('active');
        document.getElementById('sellSection').classList.add('active');
    } else if (section === 'buy') {
        document.querySelector('.sidebar-menu li:nth-child(4)').classList.add('active');
        document.getElementById('buySection').classList.add('active');
    } else if (section === 'profit') {
        document.querySelector('.sidebar-menu li:nth-child(5)').classList.add('active');
        document.getElementById('profitSection').classList.add('active');
        loadProfit();
    } else if (section === 'lowstock') {
        document.querySelector('.sidebar-menu li:nth-child(6)').classList.add('active');
        document.getElementById('lowstockSection').classList.add('active');
        loadLowStock();
    } else if (section === 'shipments') {
        document.querySelector('.sidebar-menu li:nth-child(7)').classList.add('active');
        document.getElementById('shipmentsSection').classList.add('active');
        loadShipments();
    } else if (section === 'reports') {
        document.querySelector('.sidebar-menu li:nth-child(8)').classList.add('active');
        document.getElementById('reportsSection').classList.add('active');
        loadReports();
    }
}

async function loadItems() {
    const search = document.getElementById('searchItem')?.value || '';
    try {
        const res = await fetch(API_BASE + '/api/items');
        const data = await res.json();
        items = data;
        const filtered = items.filter(i => i.name.includes(search));
        const tbody = document.getElementById('itemsBody');
        tbody.innerHTML = filtered.map(item => `
            <tr>
                <td data-label="الاسم">${item.name}</td>
                <td data-label="الكمية">${item.quantity}</td>
                <td data-label="سعر البيع">${item.price}</td>
                <td data-label="سعر الشراء">${item.cost || 0}</td>
                <td data-label="أقل كمية للإنذار">${item.minStock || 0}</td>
                <td data-label="إجراءات">
                    <button class="btn btn-warning btn-sm" onclick="editItem(${item.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="deleteItem(${item.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
        checkLowStockNotification();
    } catch (error) {
        alert('فشل تحميل الأصناف: ' + error.message);
    }
}

function showAddItemModal() {
    document.getElementById('modalTitle').innerText = 'إضافة صنف';
    document.getElementById('itemForm').reset();
    document.getElementById('itemId').value = '';
    document.getElementById('itemModal').style.display = 'flex';
}

function editItem(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    document.getElementById('modalTitle').innerText = 'تعديل صنف';
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemQuantity').value = item.quantity;
    document.getElementById('itemPrice').value = item.price;
    document.getElementById('itemCost').value = item.cost || 0;
    document.getElementById('itemMinStock').value = item.minStock || 0;
    document.getElementById('itemModal').style.display = 'flex';
}

function closeItemModal() {
    document.getElementById('itemModal').style.display = 'none';
}

document.getElementById('itemForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('itemId').value;
    const item = {
        name: document.getElementById('itemName').value,
        quantity: parseInt(document.getElementById('itemQuantity').value),
        price: parseFloat(document.getElementById('itemPrice').value),
        cost: parseFloat(document.getElementById('itemCost').value),
        minStock: parseInt(document.getElementById('itemMinStock').value)
    };
    try {
        if (id) {
            await fetch(API_BASE + '/api/items/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            alert('تم التحديث');
        } else {
            await fetch(API_BASE + '/api/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            alert('تمت الإضافة');
        }
        closeItemModal();
        await loadItems();
        await loadDashboard();
        await loadProfit();
        await loadReports();
        await loadLowStock();
    } catch (error) {
        alert('حدث خطأ: ' + error.message);
    }
});

async function deleteItem(id) {
    if (!confirm('هل أنت متأكد؟')) return;
    try {
        await fetch(API_BASE + '/api/items/' + id, { method: 'DELETE' });
        await loadItems();
        await loadDashboard();
        await loadProfit();
        await loadReports();
        await loadLowStock();
    } catch (error) {
        alert('فشل الحذف: ' + error.message);
    }
}

// المبيعات
function addSellItem() {
    const container = document.getElementById('sellItems');
    const index = sellItems.length;
    const div = document.createElement('div');
    div.className = 'sell-item';
    div.innerHTML = `
        <select onchange="updateSellItem(${index})" id="sell-item-${index}">
            <option value="">اختر صنف...</option>
            ${items.map(i => `<option value="${i.id}" data-price="${i.price}">${i.name} (${i.price} ج.س)</option>`).join('')}
        </select>
        <input type="number" placeholder="الكمية" onchange="updateSellItem(${index})" id="sell-qty-${index}">
        <span>الإجمالي: <span id="sell-total-${index}">0</span></span>
        <button onclick="removeSellItem(${index})"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
    sellItems.push({ index, id: null, qty: 0, price: 0 });
}

function updateSellItem(index) {
    const select = document.getElementById(`sell-item-${index}`);
    const qtyInput = document.getElementById(`sell-qty-${index}`);
    const totalSpan = document.getElementById(`sell-total-${index}`);
    const option = select.options[select.selectedIndex];
    if (option.value) {
        const price = parseFloat(option.dataset.price);
        const qty = parseInt(qtyInput.value) || 0;
        const total = price * qty;
        totalSpan.innerText = total;
        sellItems[index] = { index, id: parseInt(option.value), qty, price, total };
    } else {
        totalSpan.innerText = 0;
        sellItems[index] = { index, id: null, qty: 0, price: 0, total: 0 };
    }
    calculateSellTotal();
}

function calculateSellTotal() {
    const total = sellItems.reduce((sum, item) => sum + (item.total || 0), 0);
    document.getElementById('sellTotal').innerText = total;
}

function removeSellItem(index) {
    const div = document.querySelectorAll('.sell-item')[index];
    if (div) div.remove();
    sellItems.splice(index, 1);
    const itemsDivs = document.querySelectorAll('.sell-item');
    itemsDivs.forEach((div, i) => {
        div.querySelector('select').id = `sell-item-${i}`;
        div.querySelector('select').setAttribute('onchange', `updateSellItem(${i})`);
        div.querySelector('input').id = `sell-qty-${i}`;
        div.querySelector('input').setAttribute('onchange', `updateSellItem(${i})`);
        div.querySelector('span span').id = `sell-total-${i}`;
    });
    calculateSellTotal();
}

async function submitSell() {
    const itemsToSell = sellItems.filter(i => i.id && i.qty > 0);
    if (itemsToSell.length === 0) {
        alert('أضف أصناف للبيع');
        return;
    }
    const total = itemsToSell.reduce((sum, i) => sum + i.total, 0);
    const paymentMethod = document.getElementById('paymentMethod').value;
    try {
        const res = await fetch(API_BASE + '/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: itemsToSell, total, paymentMethod })
        });
        const data = await res.json();
        if (res.ok) {
            alert('تم تسجيل البيع');
            document.getElementById('sellItems').innerHTML = '';
            sellItems = [];
            calculateSellTotal();
            await loadItems();
            await loadDashboard();
            await loadProfit();
            await loadReports();
            await loadLowStock();
        } else {
            alert(data.error);
        }
    } catch (error) {
        alert('فشل الاتصال: ' + error.message);
    }
}

// المشتريات
function addBuyItem() {
    const container = document.getElementById('buyItems');
    const index = buyItems.length;
    const div = document.createElement('div');
    div.className = 'buy-item';
    div.innerHTML = `
        <select onchange="updateBuyItem(${index})" id="buy-item-${index}">
            <option value="">اختر صنف...</option>
            ${items.map(i => `<option value="${i.id}" data-price="${i.cost || 0}">${i.name} (${i.cost || 0} ج.س)</option>`).join('')}
        </select>
        <input type="number" placeholder="الكمية" onchange="updateBuyItem(${index})" id="buy-qty-${index}">
        <span>الإجمالي: <span id="buy-total-${index}">0</span></span>
        <button onclick="removeBuyItem(${index})"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
    buyItems.push({ index, id: null, qty: 0, price: 0 });
}

function updateBuyItem(index) {
    const select = document.getElementById(`buy-item-${index}`);
    const qtyInput = document.getElementById(`buy-qty-${index}`);
    const totalSpan = document.getElementById(`buy-total-${index}`);
    const option = select.options[select.selectedIndex];
    if (option.value) {
        const price = parseFloat(option.dataset.price);
        const qty = parseInt(qtyInput.value) || 0;
        const total = price * qty;
        totalSpan.innerText = total;
        buyItems[index] = { index, id: parseInt(option.value), qty, price, total };
    } else {
        totalSpan.innerText = 0;
        buyItems[index] = { index, id: null, qty: 0, price: 0, total: 0 };
    }
    calculateBuyTotal();
}

function calculateBuyTotal() {
    const total = buyItems.reduce((sum, item) => sum + (item.total || 0), 0);
    document.getElementById('buyTotal').innerText = total;
}

function removeBuyItem(index) {
    const div = document.querySelectorAll('.buy-item')[index];
    if (div) div.remove();
    buyItems.splice(index, 1);
    const itemsDivs = document.querySelectorAll('.buy-item');
    itemsDivs.forEach((div, i) => {
        div.querySelector('select').id = `buy-item-${i}`;
        div.querySelector('select').setAttribute('onchange', `updateBuyItem(${i})`);
        div.querySelector('input').id = `buy-qty-${i}`;
        div.querySelector('input').setAttribute('onchange', `updateBuyItem(${i})`);
        div.querySelector('span span').id = `buy-total-${i}`;
    });
    calculateBuyTotal();
}

async function submitBuy() {
    const itemsToBuy = buyItems.filter(i => i.id && i.qty > 0);
    if (itemsToBuy.length === 0) {
        alert('أضف أصناف للشراء');
        return;
    }
    const total = itemsToBuy.reduce((sum, i) => sum + i.total, 0);
    try {
        const res = await fetch(API_BASE + '/api/purchases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: itemsToBuy, total })
        });
        const data = await res.json();
        if (res.ok) {
            alert('تم تسجيل الشراء');
            document.getElementById('buyItems').innerHTML = '';
            buyItems = [];
            calculateBuyTotal();
            await loadItems();
            await loadDashboard();
            await loadProfit();
            await loadReports();
            await loadLowStock();
        } else {
            alert(data.error);
        }
    } catch (error) {
        alert('فشل الاتصال: ' + error.message);
    }
}

// الإرساليات
async function loadShipments() {
    try {
        const res = await fetch(API_BASE + '/api/shipments');
        const data = await res.json();
        shipments = data;
        const tbody = document.getElementById('shipmentsBody');
        tbody.innerHTML = shipments.map(s => `
            <tr>
                <td data-label="التاريخ">${new Date(s.date).toLocaleString('ar-EG')}</td>
                <td data-label="الاسم">${s.personName}</td>
                <td data-label="المنطقة">${s.region}</td>
                <td data-label="القطعة">${s.itemDescription}</td>
                <td data-label="سعر القطعة">${s.itemPrice}</td>
                <td data-label="أتعابي">${s.myFee}</td>
                <td data-label="الإجمالي">${s.total}</td>
                <td data-label="الحالة"><span class="status ${s.status}">${s.status === 'pending' ? 'قيد التنفيذ' : 'مكتملة'}</span></td>
                <td data-label="إجراءات">
                    <button class="btn btn-warning btn-sm" onclick="editShipment(${s.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="deleteShipment(${s.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        alert('فشل تحميل الإرساليات: ' + error.message);
    }
}

function showAddShipmentModal() {
    document.getElementById('shipmentModalTitle').innerText = 'إضافة إرسالية';
    document.getElementById('shipmentForm').reset();
    document.getElementById('shipmentId').value = '';
    document.getElementById('shipmentModal').style.display = 'flex';
}

function editShipment(id) {
    const shipment = shipments.find(s => s.id === id);
    if (!shipment) return;
    document.getElementById('shipmentModalTitle').innerText = 'تعديل إرسالية';
    document.getElementById('shipmentId').value = shipment.id;
    document.getElementById('shipmentPersonName').value = shipment.personName;
    document.getElementById('shipmentRegion').value = shipment.region;
    document.getElementById('shipmentItemDescription').value = shipment.itemDescription;
    document.getElementById('shipmentItemPrice').value = shipment.itemPrice;
    document.getElementById('shipmentMyFee').value = shipment.myFee;
    document.getElementById('shipmentStatus').value = shipment.status;
    document.getElementById('shipmentModal').style.display = 'flex';
}

function closeShipmentModal() {
    document.getElementById('shipmentModal').style.display = 'none';
}

document.getElementById('shipmentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('shipmentId').value;
    const shipment = {
        personName: document.getElementById('shipmentPersonName').value,
        region: document.getElementById('shipmentRegion').value,
        itemDescription: document.getElementById('shipmentItemDescription').value,
        itemPrice: parseFloat(document.getElementById('shipmentItemPrice').value) || 0,
        myFee: parseFloat(document.getElementById('shipmentMyFee').value) || 0,
        status: document.getElementById('shipmentStatus').value
    };
    try {
        if (id) {
            await fetch(API_BASE + '/api/shipments/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(shipment)
            });
            alert('تم التحديث');
        } else {
            await fetch(API_BASE + '/api/shipments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(shipment)
            });
            alert('تمت الإضافة');
        }
        closeShipmentModal();
        await loadShipments();
    } catch (error) {
        alert('حدث خطأ: ' + error.message);
    }
});

async function deleteShipment(id) {
    if (!confirm('هل أنت متأكد؟')) return;
    try {
        await fetch(API_BASE + '/api/shipments/' + id, { method: 'DELETE' });
        await loadShipments();
    } catch (error) {
        alert('فشل الحذف: ' + error.message);
    }
}

// دوال عرض التفاصيل
function showDetailsModal(title, headers, rows) {
    document.getElementById('detailsModalTitle').innerText = title;
    const thead = document.getElementById('detailsTableHead');
    const tbody = document.getElementById('detailsTableBody');
    thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    tbody.innerHTML = rows;
    document.getElementById('detailsModal').style.display = 'flex';
}

function closeDetailsModal() {
    document.getElementById('detailsModal').style.display = 'none';
}

async function showSalesDetails() {
    try {
        const res = await fetch(API_BASE + '/api/sales/all');
        if (!res.ok) throw new Error('فشل الاتصال');
        const sales = await res.json();
        if (sales.length === 0) {
            alert('لا توجد مبيعات مسجلة بعد');
            return;
        }
        const headers = ['التاريخ', 'المبلغ', 'طريقة الدفع', 'الربح'];
        const rows = sales.map(s => `
            <tr>
                <td>${new Date(s.date).toLocaleString('ar-EG')}</td>
                <td>${s.total}</td>
                <td>${s.paymentMethod === 'bank' ? 'بنكك' : s.paymentMethod === 'cash' ? 'كاش' : 'فوري'}</td>
                <td>${s.profit || 0}</td>
            </tr>
        `).join('');
        showDetailsModal('تفاصيل المبيعات', headers, rows);
    } catch (error) {
        alert('فشل تحميل تفاصيل المبيعات: ' + error.message);
    }
}

async function showPurchasesDetails() {
    try {
        const res = await fetch(API_BASE + '/api/purchases/all');
        if (!res.ok) throw new Error('فشل الاتصال');
        const purchases = await res.json();
        if (purchases.length === 0) {
            alert('لا توجد مشتريات مسجلة بعد');
            return;
        }
        const headers = ['التاريخ', 'المبلغ'];
        const rows = purchases.map(p => `
            <tr>
                <td>${new Date(p.date).toLocaleString('ar-EG')}</td>
                <td>${p.total}</td>
            </tr>
        `).join('');
        showDetailsModal('تفاصيل المشتريات', headers, rows);
    } catch (error) {
        alert('فشل تحميل تفاصيل المشتريات: ' + error.message);
    }
}

async function loadDashboard() {
    try {
        const res = await fetch(API_BASE + '/api/financial-summary');
        const data = await res.json();
        const stats = document.getElementById('dashboardStats');
        stats.innerHTML = `
            <div class="stat-card" onclick="showSalesDetails()">
                <i class="fas fa-money-bill-wave"></i>
                <div class="stat-value">${data.totalSales}</div>
                <div class="stat-label">إجمالي المبيعات</div>
            </div>
            <div class="stat-card" onclick="showPurchasesDetails()">
                <i class="fas fa-truck"></i>
                <div class="stat-value">${data.totalPurchases}</div>
                <div class="stat-label">إجمالي المشتريات</div>
            </div>
            <div class="stat-card">
                <i class="fas fa-chart-line"></i>
                <div class="stat-value">${data.totalProfit}</div>
                <div class="stat-label">إجمالي الأرباح</div>
            </div>
            <div class="stat-card">
                <i class="fas fa-calendar-day"></i>
                <div class="stat-value">${data.todaySales}</div>
                <div class="stat-label">مبيعات اليوم</div>
            </div>
            <div class="stat-card">
                <i class="fas fa-calendar-alt"></i>
                <div class="stat-value">${data.monthSales}</div>
                <div class="stat-label">مبيعات الشهر</div>
            </div>
        `;

        const monthlyRes = await fetch(API_BASE + '/api/sales/monthly');
        const monthlyData = await monthlyRes.json();

        if (dashboardChart) dashboardChart.destroy();
        const ctx = document.getElementById('dashboardChart').getContext('2d');
        dashboardChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: monthlyData.months,
                datasets: [{
                    label: 'المبيعات',
                    data: monthlyData.data,
                    backgroundColor: 'rgba(243, 156, 18, 0.2)',
                    borderColor: '#f39c12',
                    borderWidth: 2,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'المبيعات الشهرية الفعلية' }
                }
            }
        });

        const lowStock = items.filter(i => i.quantity <= i.minStock);
        const lowTbody = document.querySelector('#dashboardLowStockTable tbody');
        lowTbody.innerHTML = lowStock.map(i => `
            <tr><td data-label="الاسم">${i.name}</td><td data-label="الكمية">${i.quantity}</td><td data-label="أقل كمية للإنذار">${i.minStock}</td></tr>
        `).join('');
    } catch (error) {
        console.error(error);
    }
}

async function loadProfit() {
    try {
        const res = await fetch(API_BASE + '/api/financial-summary');
        const data = await res.json();
        const stats = document.getElementById('profitStats');
        stats.innerHTML = `
            <div class="stat-card">
                <i class="fas fa-chart-line"></i>
                <div class="stat-value">${data.totalProfit}</div>
                <div class="stat-label">إجمالي الأرباح</div>
            </div>
            <div class="stat-card">
                <i class="fas fa-calendar-day"></i>
                <div class="stat-value">${data.todayProfit}</div>
                <div class="stat-label">أرباح اليوم</div>
            </div>
            <div class="stat-card">
                <i class="fas fa-calendar-alt"></i>
                <div class="stat-value">${data.monthProfit}</div>
                <div class="stat-label">أرباح الشهر</div>
            </div>
        `;

        if (profitChart) profitChart.destroy();
        const ctx = document.getElementById('profitChart').getContext('2d');
        profitChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['اليوم', 'الشهر', 'الإجمالي'],
                datasets: [{
                    label: 'الأرباح',
                    data: [data.todayProfit, data.monthProfit, data.totalProfit],
                    backgroundColor: ['#3498db', '#2ecc71', '#f39c12'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'تحليل الأرباح' }
                }
            }
        });
    } catch (error) {
        console.error(error);
    }
}

async function loadLowStock() {
    const lowStock = items.filter(i => i.quantity <= i.minStock);
    const tbody = document.querySelector('#lowstockFullTable tbody');
    if (!tbody) return;
    tbody.innerHTML = lowStock.map(i => `
        <tr>
            <td data-label="الاسم">${i.name}</td>
            <td data-label="الكمية">${i.quantity}</td>
            <td data-label="أقل كمية للإنذار">${i.minStock}</td>
        </tr>
    `).join('');
}

async function loadReports() {
    try {
        const res = await fetch(API_BASE + '/api/financial-summary');
        const data = await res.json();
        const stats = document.getElementById('reportsStats');
        stats.innerHTML = `
            <div class="stat-card" onclick="showSalesDetails()">
                <i class="fas fa-money-bill-wave"></i>
                <div class="stat-value">${data.totalSales}</div>
                <div class="stat-label">إجمالي المبيعات</div>
            </div>
            <div class="stat-card" onclick="showPurchasesDetails()">
                <i class="fas fa-truck"></i>
                <div class="stat-value">${data.totalPurchases}</div>
                <div class="stat-label">إجمالي المشتريات</div>
            </div>
            <div class="stat-card">
                <i class="fas fa-chart-line"></i>
                <div class="stat-value">${data.totalProfit}</div>
                <div class="stat-label">إجمالي الأرباح</div>
            </div>
            <div class="stat-card">
                <i class="fas fa-calendar-day"></i>
                <div class="stat-value">${data.todaySales}</div>
                <div class="stat-label">مبيعات اليوم</div>
            </div>
            <div class="stat-card">
                <i class="fas fa-calendar-alt"></i>
                <div class="stat-value">${data.monthSales}</div>
                <div class="stat-label">مبيعات الشهر</div>
            </div>
        `;
    } catch (error) {
        console.error(error);
    }
}

function showChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'flex';
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'none';
    document.getElementById('changePasswordForm').reset();
}

document.getElementById('changePasswordForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;

    if (newPassword !== confirm) {
        alert('كلمة المرور الجديدة غير متطابقة');
        return;
    }

    try {
        const res = await fetch(API_BASE + '/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPassword, newPassword })
        });
        const data = await res.json();
        if (res.ok) {
            alert('تم تغيير كلمة المرور بنجاح');
            closeChangePasswordModal();
        } else {
            alert(data.error || 'فشل تغيير كلمة المرور');
        }
    } catch (error) {
        alert('خطأ في الاتصال: ' + error.message);
    }
});

// دالة طباعة القسم
function printSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    const title = section.querySelector('h2')?.innerText || 'تقرير';

    const printWindow = window.open('', '_blank');
    printWindow.document.write('<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>' + title + '</title>');

    const links = document.querySelectorAll('link[rel="stylesheet"]');
    links.forEach(link => {
        printWindow.document.write('<link rel="stylesheet" href="' + link.href + '" type="text/css">');
    });

    printWindow.document.write('<style>@media print { body { padding: 20px; } .no-print { display: none; } }</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write('<h2>' + title + '</h2>');

    const content = section.cloneNode(true);
    content.querySelectorAll('.btn, .action-bar, .section-header .btn').forEach(el => el.remove());
    printWindow.document.write(content.innerHTML);

    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
}

// تحميل أولي
loadItems();