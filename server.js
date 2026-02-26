require('dotenv').config(); // لتحميل متغيرات البيئة من ملف .env
const express = require('express');
const { Pool } = require('pg'); // استيراد Pool من pg
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد الاتصال بقاعدة البيانات PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// اختبار الاتصال بقاعدة البيانات
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
  } else {
    console.log('✅ متصل بقاعدة بيانات PostgreSQL');
    release();
    initDatabase();
  }
});

// دوال مساعدة للاستعلامات
const query = (text, params) => pool.query(text, params);

// تهيئة قاعدة البيانات (إنشاء الجداول إذا لم تكن موجودة)
async function initDatabase() {
  try {
    // جدول الأصناف
    await query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        quantity INTEGER DEFAULT 0,
        price NUMERIC NOT NULL,
        cost NUMERIC DEFAULT 0,
        minStock INTEGER DEFAULT 0
      )
    `);

    // جدول المبيعات
    await query(`
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total NUMERIC NOT NULL,
        paymentMethod VARCHAR(50) DEFAULT 'cash',
        items JSONB,
        profit NUMERIC DEFAULT 0
      )
    `);

    // جدول المشتريات
    await query(`
      CREATE TABLE IF NOT EXISTS purchases (
        id SERIAL PRIMARY KEY,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total NUMERIC NOT NULL,
        items JSONB
      )
    `);

    // جدول الإرساليات
    await query(`
      CREATE TABLE IF NOT EXISTS shipments (
        id SERIAL PRIMARY KEY,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        personName VARCHAR(255) NOT NULL,
        region VARCHAR(255) NOT NULL,
        itemDescription TEXT NOT NULL,
        itemPrice NUMERIC DEFAULT 0,
        myFee NUMERIC DEFAULT 0,
        total NUMERIC DEFAULT 0,
        status VARCHAR(50) DEFAULT 'pending'
      )
    `);

    // جدول المستخدم
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL
      )
    `);

    // إدراج المستخدم الافتراضي إذا لم يكن موجوداً
    const userCheck = await query('SELECT * FROM users WHERE username = $1', ['عاصم عبدالله ود كمون']);
    if (userCheck.rows.length === 0) {
      await query('INSERT INTO users (username, password) VALUES ($1, $2)', ['عاصم عبدالله ود كمون', '123456']);
      console.log('👤 تم إنشاء المستخدم الافتراضي');
    }

    console.log('✅ تم تهيئة الجداول بنجاح');
  } catch (err) {
    console.error('❌ خطأ في تهيئة قاعدة البيانات:', err.message);
  }
}

// -------------------- API Endpoints --------------------

// الأصناف
app.get('/api/items', async (req, res) => {
  try {
    const result = await query('SELECT * FROM items ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', async (req, res) => {
  const { name, quantity, price, cost, minStock } = req.body;
  try {
    const result = await query(
      'INSERT INTO items (name, quantity, price, cost, minStock) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, quantity, price, cost || 0, minStock || 0]
    );
    res.json({ id: result.rows[0].id, message: 'تمت الإضافة' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/items/:id', async (req, res) => {
  const { name, quantity, price, cost, minStock } = req.body;
  const { id } = req.params;
  try {
    await query(
      'UPDATE items SET name=$1, quantity=$2, price=$3, cost=$4, minStock=$5 WHERE id=$6',
      [name, quantity, price, cost, minStock, id]
    );
    res.json({ message: 'تم التحديث' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM items WHERE id = $1', [id]);
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// المبيعات
app.post('/api/sales', async (req, res) => {
  const { items, total, paymentMethod } = req.body;
  let profit = 0;

  try {
    // حساب الربح لكل عنصر
    for (const item of items) {
      const costRes = await query('SELECT cost FROM items WHERE id = $1', [item.id]);
      const cost = costRes.rows[0]?.cost || 0;
      profit += (item.price - cost) * item.quantity;
    }

    // بدء معاملة
    await query('BEGIN');
    const saleRes = await query(
      'INSERT INTO sales (total, paymentMethod, items, profit) VALUES ($1, $2, $3, $4) RETURNING id',
      [total, paymentMethod, JSON.stringify(items), profit]
    );

    for (const item of items) {
      await query('UPDATE items SET quantity = quantity - $1 WHERE id = $2', [item.quantity, item.id]);
    }

    await query('COMMIT');
    res.json({ id: saleRes.rows[0].id, message: 'تم تسجيل البيع' });
  } catch (err) {
    await query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// المشتريات
app.post('/api/purchases', async (req, res) => {
  const { items, total } = req.body;
  try {
    await query('BEGIN');
    const purRes = await query(
      'INSERT INTO purchases (total, items) VALUES ($1, $2) RETURNING id',
      [total, JSON.stringify(items)]
    );

    for (const item of items) {
      await query('UPDATE items SET quantity = quantity + $1 WHERE id = $2', [item.quantity, item.id]);
    }

    await query('COMMIT');
    res.json({ id: purRes.rows[0].id, message: 'تم تسجيل الشراء' });
  } catch (err) {
    await query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// التقارير المالية
app.get('/api/financial-summary', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const month = today.slice(0, 7); // YYYY-MM

    const result = await query(`
      SELECT
        (SELECT COALESCE(SUM(total), 0) FROM sales) as "totalSales",
        (SELECT COALESCE(SUM(profit), 0) FROM sales) as "totalProfit",
        (SELECT COALESCE(SUM(total), 0) FROM purchases) as "totalPurchases",
        (SELECT COALESCE(SUM(total), 0) FROM sales WHERE DATE(date) = $1) as "todaySales",
        (SELECT COALESCE(SUM(profit), 0) FROM sales WHERE DATE(date) = $1) as "todayProfit",
        (SELECT COALESCE(SUM(total), 0) FROM sales WHERE TO_CHAR(date, 'YYYY-MM') = $2) as "monthSales",
        (SELECT COALESCE(SUM(profit), 0) FROM sales WHERE TO_CHAR(date, 'YYYY-MM') = $2) as "monthProfit",
        (SELECT COALESCE(SUM(total), 0) FROM purchases WHERE DATE(date) = $1) as "todayPurchases"
    `, [today, month]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// المبيعات الشهرية للرسم البياني
app.get('/api/sales/monthly', async (req, res) => {
  try {
    // آخر 6 أشهر
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      months.push(`${year}-${month}`);
    }

    const placeholders = months.map((_, idx) => `$${idx + 1}`).join(',');
    const queryStr = `
      SELECT TO_CHAR(date, 'YYYY-MM') as month, SUM(total) as total
      FROM sales
      WHERE TO_CHAR(date, 'YYYY-MM') IN (${placeholders})
      GROUP BY month
      ORDER BY month
    `;

    const result = await query(queryStr, months);
    const dataMap = result.rows.reduce((acc, row) => {
      acc[row.month] = parseFloat(row.total);
      return acc;
    }, {});

    const data = months.map(m => dataMap[m] || 0);
    const labels = months.map(m => {
      const [y, mo] = m.split('-');
      return `${mo}/${y}`;
    });

    res.json({ months: labels, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جميع المبيعات (للتفاصيل)
app.get('/api/sales/all', async (req, res) => {
  try {
    const result = await query('SELECT * FROM sales ORDER BY date DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جميع المشتريات (للتفاصيل)
app.get('/api/purchases/all', async (req, res) => {
  try {
    const result = await query('SELECT * FROM purchases ORDER BY date DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// الإرساليات
app.get('/api/shipments', async (req, res) => {
  try {
    const result = await query('SELECT * FROM shipments ORDER BY date DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shipments', async (req, res) => {
  const { personName, region, itemDescription, itemPrice, myFee, status } = req.body;
  const total = (parseFloat(itemPrice) || 0) + (parseFloat(myFee) || 0);
  try {
    const result = await query(
      `INSERT INTO shipments (personName, region, itemDescription, itemPrice, myFee, total, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [personName, region, itemDescription, itemPrice || 0, myFee || 0, total, status || 'pending']
    );
    res.json({ id: result.rows[0].id, message: 'تمت إضافة الإرسالية' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/shipments/:id', async (req, res) => {
  const { personName, region, itemDescription, itemPrice, myFee, status } = req.body;
  const total = (parseFloat(itemPrice) || 0) + (parseFloat(myFee) || 0);
  const { id } = req.params;
  try {
    await query(
      `UPDATE shipments SET personName=$1, region=$2, itemDescription=$3, itemPrice=$4, myFee=$5, total=$6, status=$7 WHERE id=$8`,
      [personName, region, itemDescription, itemPrice, myFee, total, status, id]
    );
    res.json({ message: 'تم التحديث' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/shipments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM shipments WHERE id = $1', [id]);
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    if (result.rows.length > 0) {
      res.json({ success: true, message: 'تم تسجيل الدخول' });
    } else {
      res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تغيير كلمة المرور
app.post('/api/change-password', async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  try {
    const userRes = await query('SELECT * FROM users WHERE username = $1', ['عاصم عبدالله ود كمون']);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    const user = userRes.rows[0];
    if (user.password !== oldPassword) {
      return res.status(401).json({ error: 'كلمة المرور القديمة غير صحيحة' });
    }
    await query('UPDATE users SET password = $1 WHERE username = $2', [newPassword, 'عاصم عبدالله ود كمون']);
    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تقديم الملفات الثابتة (public)
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
});require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد الاتصال بقاعدة البيانات PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// اختبار الاتصال بقاعدة البيانات
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
  } else {
    console.log('✅ متصل بقاعدة بيانات PostgreSQL');
    release();
    initDatabase();
  }
});

const query = (text, params) => pool.query(text, params);

async function initDatabase() {
  try {
    // جدول الأصناف
    await query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        quantity INTEGER DEFAULT 0,
        price NUMERIC NOT NULL,
        cost NUMERIC DEFAULT 0,
        minStock INTEGER DEFAULT 0
      )
    `);

    // جدول المبيعات
    await query(`
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total NUMERIC NOT NULL,
        paymentMethod VARCHAR(50) DEFAULT 'cash',
        items JSONB,
        profit NUMERIC DEFAULT 0
      )
    `);

    // جدول المشتريات
    await query(`
      CREATE TABLE IF NOT EXISTS purchases (
        id SERIAL PRIMARY KEY,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total NUMERIC NOT NULL,
        items JSONB
      )
    `);

    // جدول الإرساليات
    await query(`
      CREATE TABLE IF NOT EXISTS shipments (
        id SERIAL PRIMARY KEY,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        personName VARCHAR(255) NOT NULL,
        region VARCHAR(255) NOT NULL,
        itemDescription TEXT NOT NULL,
        itemPrice NUMERIC DEFAULT 0,
        myFee NUMERIC DEFAULT 0,
        total NUMERIC DEFAULT 0,
        status VARCHAR(50) DEFAULT 'pending'
      )
    `);

    // جدول المستخدم
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL
      )
    `);

    // إدراج المستخدم الافتراضي إذا لم يكن موجوداً
    const userCheck = await query('SELECT * FROM users WHERE username = $1', ['عاصم عبدالله ود كمون']);
    if (userCheck.rows.length === 0) {
      await query('INSERT INTO users (username, password) VALUES ($1, $2)', ['عاصم عبدالله ود كمون', '123456']);
      console.log('👤 تم إنشاء المستخدم الافتراضي');
    }

    console.log('✅ تم تهيئة الجداول بنجاح');
  } catch (err) {
    console.error('❌ خطأ في تهيئة قاعدة البيانات:', err.message);
  }
}

// -------------------- API Endpoints --------------------

// الأصناف
app.get('/api/items', async (req, res) => {
  try {
    const result = await query('SELECT * FROM items ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', async (req, res) => {
  const { name, quantity, price, cost, minStock } = req.body;
  try {
    const result = await query(
      'INSERT INTO items (name, quantity, price, cost, minStock) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, quantity, price, cost || 0, minStock || 0]
    );
    res.json({ id: result.rows[0].id, message: 'تمت الإضافة' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/items/:id', async (req, res) => {
  const { name, quantity, price, cost, minStock } = req.body;
  const { id } = req.params;
  try {
    await query(
      'UPDATE items SET name=$1, quantity=$2, price=$3, cost=$4, minStock=$5 WHERE id=$6',
      [name, quantity, price, cost, minStock, id]
    );
    res.json({ message: 'تم التحديث' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM items WHERE id = $1', [id]);
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// المبيعات
app.post('/api/sales', async (req, res) => {
  const { items, total, paymentMethod } = req.body;
  let profit = 0;

  try {
    for (const item of items) {
      const costRes = await query('SELECT cost FROM items WHERE id = $1', [item.id]);
      const cost = costRes.rows[0]?.cost || 0;
      profit += (item.price - cost) * item.quantity;
    }

    await query('BEGIN');
    const saleRes = await query(
      'INSERT INTO sales (total, paymentMethod, items, profit) VALUES ($1, $2, $3, $4) RETURNING id',
      [total, paymentMethod, JSON.stringify(items), profit]
    );

    for (const item of items) {
      await query('UPDATE items SET quantity = quantity - $1 WHERE id = $2', [item.quantity, item.id]);
    }

    await query('COMMIT');
    res.json({ id: saleRes.rows[0].id, message: 'تم تسجيل البيع' });
  } catch (err) {
    await query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// المشتريات
app.post('/api/purchases', async (req, res) => {
  const { items, total } = req.body;
  try {
    await query('BEGIN');
    const purRes = await query(
      'INSERT INTO purchases (total, items) VALUES ($1, $2) RETURNING id',
      [total, JSON.stringify(items)]
    );

    for (const item of items) {
      await query('UPDATE items SET quantity = quantity + $1 WHERE id = $2', [item.quantity, item.id]);
    }

    await query('COMMIT');
    res.json({ id: purRes.rows[0].id, message: 'تم تسجيل الشراء' });
  } catch (err) {
    await query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// التقارير المالية
app.get('/api/financial-summary', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const month = today.slice(0, 7);

    const result = await query(`
      SELECT
        (SELECT COALESCE(SUM(total), 0) FROM sales) as "totalSales",
        (SELECT COALESCE(SUM(profit), 0) FROM sales) as "totalProfit",
        (SELECT COALESCE(SUM(total), 0) FROM purchases) as "totalPurchases",
        (SELECT COALESCE(SUM(total), 0) FROM sales WHERE DATE(date) = $1) as "todaySales",
        (SELECT COALESCE(SUM(profit), 0) FROM sales WHERE DATE(date) = $1) as "todayProfit",
        (SELECT COALESCE(SUM(total), 0) FROM sales WHERE TO_CHAR(date, 'YYYY-MM') = $2) as "monthSales",
        (SELECT COALESCE(SUM(profit), 0) FROM sales WHERE TO_CHAR(date, 'YYYY-MM') = $2) as "monthProfit",
        (SELECT COALESCE(SUM(total), 0) FROM purchases WHERE DATE(date) = $1) as "todayPurchases"
    `, [today, month]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// المبيعات الشهرية
app.get('/api/sales/monthly', async (req, res) => {
  try {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      months.push(`${year}-${month}`);
    }

    const placeholders = months.map((_, idx) => `$${idx + 1}`).join(',');
    const queryStr = `
      SELECT TO_CHAR(date, 'YYYY-MM') as month, SUM(total) as total
      FROM sales
      WHERE TO_CHAR(date, 'YYYY-MM') IN (${placeholders})
      GROUP BY month
      ORDER BY month
    `;

    const result = await query(queryStr, months);
    const dataMap = result.rows.reduce((acc, row) => {
      acc[row.month] = parseFloat(row.total);
      return acc;
    }, {});

    const data = months.map(m => dataMap[m] || 0);
    const labels = months.map(m => {
      const [y, mo] = m.split('-');
      return `${mo}/${y}`;
    });

    res.json({ months: labels, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جميع المبيعات
app.get('/api/sales/all', async (req, res) => {
  try {
    const result = await query('SELECT * FROM sales ORDER BY date DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جميع المشتريات
app.get('/api/purchases/all', async (req, res) => {
  try {
    const result = await query('SELECT * FROM purchases ORDER BY date DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// الإرساليات
app.get('/api/shipments', async (req, res) => {
  try {
    const result = await query('SELECT * FROM shipments ORDER BY date DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shipments', async (req, res) => {
  const { personName, region, itemDescription, itemPrice, myFee, status } = req.body;
  const total = (parseFloat(itemPrice) || 0) + (parseFloat(myFee) || 0);
  try {
    const result = await query(
      `INSERT INTO shipments (personName, region, itemDescription, itemPrice, myFee, total, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [personName, region, itemDescription, itemPrice || 0, myFee || 0, total, status || 'pending']
    );
    res.json({ id: result.rows[0].id, message: 'تمت إضافة الإرسالية' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/shipments/:id', async (req, res) => {
  const { personName, region, itemDescription, itemPrice, myFee, status } = req.body;
  const total = (parseFloat(itemPrice) || 0) + (parseFloat(myFee) || 0);
  const { id } = req.params;
  try {
    await query(
      `UPDATE shipments SET personName=$1, region=$2, itemDescription=$3, itemPrice=$4, myFee=$5, total=$6, status=$7 WHERE id=$8`,
      [personName, region, itemDescription, itemPrice, myFee, total, status, id]
    );
    res.json({ message: 'تم التحديث' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/shipments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM shipments WHERE id = $1', [id]);
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    if (result.rows.length > 0) {
      res.json({ success: true, message: 'تم تسجيل الدخول' });
    } else {
      res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تغيير كلمة المرور
app.post('/api/change-password', async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  try {
    const userRes = await query('SELECT * FROM users WHERE username = $1', ['عاصم عبدالله ود كمون']);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    const user = userRes.rows[0];
    if (user.password !== oldPassword) {
      return res.status(401).json({ error: 'كلمة المرور القديمة غير صحيحة' });
    }
    await query('UPDATE users SET password = $1 WHERE username = $2', [newPassword, 'عاصم عبدالله ود كمون']);
    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تقديم الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));

// معالجة جميع المسارات الأخرى لإرجاع index.html (للتوجيه من جانب العميل)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
});