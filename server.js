require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('❌ خطأ في فتح قاعدة البيانات:', err.message);
    } else {
        console.log('✅ متصل بقاعدة بيانات SQLite.');
        initDatabase();
    }
});

function initDatabase() {
    db.serialize(() => {
        // جدول الأصناف
        db.run(`CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            quantity INTEGER DEFAULT 0,
            price REAL NOT NULL,
            cost REAL DEFAULT 0,
            minStock INTEGER DEFAULT 0
        )`);

        // جدول المبيعات
        db.run(`CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT DEFAULT CURRENT_TIMESTAMP,
            total REAL NOT NULL,
            paymentMethod TEXT DEFAULT 'cash',
            items TEXT,
            profit REAL DEFAULT 0
        )`);

        // جدول المشتريات
        db.run(`CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT DEFAULT CURRENT_TIMESTAMP,
            total REAL NOT NULL,
            items TEXT
        )`);

        // جدول الإرساليات
        db.run(`CREATE TABLE IF NOT EXISTS shipments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT DEFAULT CURRENT_TIMESTAMP,
            personName TEXT NOT NULL,
            region TEXT NOT NULL,
            itemDescription TEXT NOT NULL,
            itemPrice REAL DEFAULT 0,
            myFee REAL DEFAULT 0,
            total REAL DEFAULT 0,
            status TEXT DEFAULT 'pending'
        )`);

        // جدول المستخدم
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )`);

        // إدراج المستخدم الافتراضي إذا لم يكن موجوداً
        db.get(`SELECT * FROM users WHERE username = ?`, ['عاصم عبدالله ود كمون'], (err, row) => {
            if (!row) {
                db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, ['عاصم عبدالله ود كمون', '123456']);
                console.log('👤 تم إنشاء المستخدم الافتراضي');
            }
        });

        console.log('✅ تم تهيئة الجداول بنجاح');
    });
}

// -------------------- API Endpoints --------------------

// الأصناف
app.get('/api/items', (req, res) => {
    db.all('SELECT * FROM items ORDER BY id', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/items', (req, res) => {
    const { name, quantity, price, cost, minStock } = req.body;
    db.run(
        'INSERT INTO items (name, quantity, price, cost, minStock) VALUES (?, ?, ?, ?, ?)',
        [name, quantity, price, cost || 0, minStock || 0],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, message: 'تمت الإضافة' });
        }
    );
});

app.put('/api/items/:id', (req, res) => {
    const { name, quantity, price, cost, minStock } = req.body;
    const { id } = req.params;
    db.run(
        'UPDATE items SET name=?, quantity=?, price=?, cost=?, minStock=? WHERE id=?',
        [name, quantity, price, cost, minStock, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'تم التحديث' });
        }
    );
});

app.delete('/api/items/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM items WHERE id = ?', id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'تم الحذف' });
    });
});

// المبيعات
app.post('/api/sales', (req, res) => {
    const { items, total, paymentMethod } = req.body;
    let profit = 0;

    // حساب الربح
    const promises = items.map(item => {
        return new Promise((resolve, reject) => {
            db.get('SELECT cost FROM items WHERE id = ?', [item.id], (err, row) => {
                if (err) reject(err);
                else {
                    const cost = row?.cost || 0;
                    profit += (item.price - cost) * item.quantity;
                    resolve();
                }
            });
        });
    });

    Promise.all(promises)
        .then(() => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run(
                    'INSERT INTO sales (total, paymentMethod, items, profit) VALUES (?, ?, ?, ?)',
                    [total, paymentMethod, JSON.stringify(items), profit],
                    function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: err.message });
                        }
                        const promises2 = items.map(item => {
                            return new Promise((resolve, reject) => {
                                db.run(
                                    'UPDATE items SET quantity = quantity - ? WHERE id = ?',
                                    [item.quantity, item.id],
                                    function(err) {
                                        if (err) reject(err);
                                        else resolve();
                                    }
                                );
                            });
                        });
                        Promise.all(promises2)
                            .then(() => {
                                db.run('COMMIT');
                                res.json({ id: this.lastID, message: 'تم تسجيل البيع' });
                            })
                            .catch(err => {
                                db.run('ROLLBACK');
                                res.status(500).json({ error: err.message });
                            });
                    }
                );
            });
        })
        .catch(err => res.status(500).json({ error: err.message }));
});

// المشتريات
app.post('/api/purchases', (req, res) => {
    const { items, total } = req.body;
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run(
            'INSERT INTO purchases (total, items) VALUES (?, ?)',
            [total, JSON.stringify(items)],
            function(err) {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: err.message });
                }
                const promises = items.map(item => {
                    return new Promise((resolve, reject) => {
                        db.run(
                            'UPDATE items SET quantity = quantity + ? WHERE id = ?',
                            [item.quantity, item.id],
                            function(err) {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                });
                Promise.all(promises)
                    .then(() => {
                        db.run('COMMIT');
                        res.json({ id: this.lastID, message: 'تم تسجيل الشراء' });
                    })
                    .catch(err => {
                        db.run('ROLLBACK');
                        res.status(500).json({ error: err.message });
                    });
            }
        );
    });
});

// التقارير المالية
app.get('/api/financial-summary', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const month = today.slice(0, 7); // YYYY-MM

    db.get(`
        SELECT
            (SELECT COALESCE(SUM(total), 0) FROM sales) as totalSales,
            (SELECT COALESCE(SUM(profit), 0) FROM sales) as totalProfit,
            (SELECT COALESCE(SUM(total), 0) FROM purchases) as totalPurchases,
            (SELECT COALESCE(SUM(total), 0) FROM sales WHERE date LIKE ?) as todaySales,
            (SELECT COALESCE(SUM(profit), 0) FROM sales WHERE date LIKE ?) as todayProfit,
            (SELECT COALESCE(SUM(total), 0) FROM sales WHERE date LIKE ?) as monthSales,
            (SELECT COALESCE(SUM(profit), 0) FROM sales WHERE date LIKE ?) as monthProfit,
            (SELECT COALESCE(SUM(total), 0) FROM purchases WHERE date LIKE ?) as todayPurchases
    `, [`${today}%`, `${today}%`, `${month}%`, `${month}%`, `${today}%`], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

// المبيعات الشهرية للرسم البياني
app.get('/api/sales/monthly', (req, res) => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        months.push(`${year}-${month}`);
    }

    const placeholders = months.map(() => '?').join(',');
    db.all(`
        SELECT strftime('%Y-%m', date) as month, SUM(total) as total
        FROM sales
        WHERE strftime('%Y-%m', date) IN (${placeholders})
        GROUP BY month
        ORDER BY month
    `, months, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const dataMap = rows.reduce((acc, row) => {
            acc[row.month] = row.total;
            return acc;
        }, {});
        const data = months.map(m => dataMap[m] || 0);
        const labels = months.map(m => {
            const [y, mo] = m.split('-');
            return `${mo}/${y}`;
        });
        res.json({ months: labels, data });
    });
});

// جميع المبيعات (للتفاصيل)
app.get('/api/sales/all', (req, res) => {
    db.all('SELECT * FROM sales ORDER BY date DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// جميع المشتريات (للتفاصيل)
app.get('/api/purchases/all', (req, res) => {
    db.all('SELECT * FROM purchases ORDER BY date DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// الإرساليات
app.get('/api/shipments', (req, res) => {
    db.all('SELECT * FROM shipments ORDER BY date DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/shipments', (req, res) => {
    const { personName, region, itemDescription, itemPrice, myFee, status } = req.body;
    const total = (parseFloat(itemPrice) || 0) + (parseFloat(myFee) || 0);
    db.run(
        `INSERT INTO shipments (personName, region, itemDescription, itemPrice, myFee, total, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [personName, region, itemDescription, itemPrice || 0, myFee || 0, total, status || 'pending'],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, message: 'تمت إضافة الإرسالية' });
        }
    );
});

app.put('/api/shipments/:id', (req, res) => {
    const { personName, region, itemDescription, itemPrice, myFee, status } = req.body;
    const total = (parseFloat(itemPrice) || 0) + (parseFloat(myFee) || 0);
    const { id } = req.params;
    db.run(
        `UPDATE shipments SET personName=?, region=?, itemDescription=?, itemPrice=?, myFee=?, total=?, status=? WHERE id=?`,
        [personName, region, itemDescription, itemPrice, myFee, total, status, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'تم التحديث' });
        }
    );
});

app.delete('/api/shipments/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM shipments WHERE id = ?', id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'تم الحذف' });
    });
});

// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
            res.json({ success: true, message: 'تم تسجيل الدخول' });
        } else {
            res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
    });
});

// تغيير كلمة المرور
app.post('/api/change-password', (req, res) => {
    const { oldPassword, newPassword } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', ['عاصم عبدالله ود كمون'], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
        if (user.password !== oldPassword) {
            return res.status(401).json({ error: 'كلمة المرور القديمة غير صحيحة' });
        }
        db.run('UPDATE users SET password = ? WHERE username = ?', [newPassword, 'عاصم عبدالله ود كمون'], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
        });
    });
});

// تقديم الملفات الثابتة (public)
app.use(express.static(path.join(__dirname, 'public')));

// معالجة جميع المسارات الأخرى لإرجاع index.html (للتوجيه من جانب العميل)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
});