const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const invoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
    cb(allowed ? null : new Error('Only image and PDF invoice files are allowed'), allowed);
  }
}).single('file');

const optionalInvoiceUpload = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    return invoiceUpload(req, res, next);
  }
  return next();
};

function saveInvoiceFile(prefix, file) {
  const dir = path.join(__dirname, '../../uploads/asset-invoices');
  fs.mkdirSync(dir, { recursive: true });
  const safe = String(file.originalname || 'invoice').replace(/[^a-zA-Z0-9._-]/g, '_');
  const name = `${prefix}-${Date.now()}-${safe}`;
  fs.writeFileSync(path.join(dir, name), file.buffer);
  return {
    url: '/uploads/asset-invoices/' + name,
    name: file.originalname || safe
  };
}

let ready;
function schema() {
  if (!ready) {
    ready = pool
      .query(`
        CREATE TABLE IF NOT EXISTS assets(
          id SERIAL PRIMARY KEY,
          asset_id VARCHAR(120) UNIQUE NOT NULL,
          name VARCHAR(200) NOT NULL,
          category VARCHAR(100),
          purchase_date DATE,
          bill_no VARCHAR(120),
          vendor_name VARCHAR(200),
          purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
          annual_depreciation_rate NUMERIC(7,3) NOT NULL DEFAULT 0,
          accumulated_depreciation NUMERIC(14,2) NOT NULL DEFAULT 0,
          book_value NUMERIC(14,2) NOT NULL DEFAULT 0,
          allocation VARCHAR(250),
          custodian VARCHAR(200),
          status VARCHAR(30) NOT NULL DEFAULT 'Active',
          disposal_date DATE,
          disposal_price NUMERIC(14,2),
          disposal_reason TEXT,
          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE assets ADD COLUMN IF NOT EXISTS bill_file_url TEXT;
        ALTER TABLE assets ADD COLUMN IF NOT EXISTS bill_file_name VARCHAR(255);
        ALTER TABLE assets ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
        ALTER TABLE assets ADD COLUMN IF NOT EXISTS specifications TEXT;
        CREATE TABLE IF NOT EXISTS asset_maintenance(
          id SERIAL PRIMARY KEY,
          asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
          maintenance_date DATE NOT NULL DEFAULT CURRENT_DATE,
          description TEXT NOT NULL,
          cost NUMERIC(14,2) NOT NULL DEFAULT 0,
          vendor_name VARCHAR(200),
          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS asset_purchases(
          id SERIAL PRIMARY KEY,
          asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
          purchase_date DATE,
          quantity INTEGER NOT NULL DEFAULT 1,
          purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
          bill_no VARCHAR(120),
          vendor_name VARCHAR(200),
          specifications TEXT,
          allocation VARCHAR(250),
          notes TEXT,
          bill_file_url TEXT,
          bill_file_name VARCHAR(255),
          is_opening BOOLEAN NOT NULL DEFAULT FALSE,
          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `)
      .catch(e => {
        ready = null;
        throw e;
      });
  }
  return ready;
}

router.use(auth, allow('super_admin', 'admin'));

router.get('/', asyncHandler(async (req, res) => {
  await schema();
  const r = await pool.query(`
    SELECT a.*,
      COALESCE((SELECT json_agg(m ORDER BY m.maintenance_date DESC, m.id DESC) FROM asset_maintenance m WHERE m.asset_id=a.id), '[]') maintenance,
      COALESCE((SELECT json_agg(p ORDER BY p.is_opening DESC, p.purchase_date ASC NULLS FIRST, p.id ASC) FROM asset_purchases p WHERE p.asset_id=a.id), '[]') purchases
    FROM assets a
    ORDER BY a.created_at DESC
  `);
  res.json({ success: true, assets: r.rows });
}));

router.post('/', asyncHandler(async (req, res) => {
  await schema();
  const b = req.body || {};
  const price = Number(b.purchase_price || 0);
  if (!String(b.asset_id || '').trim() || !String(b.name || '').trim() || !Number.isFinite(price) || price < 0) {
    return res.status(400).json({ message: 'Asset ID, name and valid purchase price are required.' });
  }
  const quantity = Math.max(1, parseInt(b.quantity, 10) || 1);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO assets(asset_id,name,category,purchase_date,bill_no,vendor_name,purchase_price,annual_depreciation_rate,book_value,allocation,custodian,quantity,specifications,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$7,$9,$10,$11,$12,$13) RETURNING *`,
      [
        String(b.asset_id).trim(),
        String(b.name).trim(),
        b.category || null,
        b.purchase_date || null,
        b.bill_no || null,
        b.vendor_name || null,
        price,
        Number(b.annual_depreciation_rate || 0),
        b.allocation || null,
        b.custodian || null,
        quantity,
        b.specifications || null,
        req.user.userId
      ]
    );
    const asset = r.rows[0];
    await client.query(
      `INSERT INTO asset_purchases(asset_id,purchase_date,quantity,purchase_price,bill_no,vendor_name,specifications,allocation,notes,is_opening,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10)`,
      [
        asset.id,
        b.purchase_date || null,
        quantity,
        price,
        b.bill_no || null,
        b.vendor_name || null,
        b.specifications || null,
        b.allocation || null,
        'Initial / Opening Stock',
        req.user.userId
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ success: true, asset });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

router.post('/:id/purchases', optionalInvoiceUpload, asyncHandler(async (req, res) => {
  await schema();
  const b = req.body || {};
  const qty = parseInt(b.quantity, 10);
  const price = Number(b.purchase_price || 0);
  if (!Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({ message: 'Valid purchase quantity (1 or more) is required.' });
  }
  if (!Number.isFinite(price) || price < 0) {
    return res.status(400).json({ message: 'Valid purchase price is required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const aRes = await client.query('SELECT * FROM assets WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!aRes.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Asset not found' });
    }
    const asset = aRes.rows[0];

    // If this is the first purchase batch recorded on a pre-existing asset, preserve its existing stock as Opening Stock
    const existingBatches = await client.query('SELECT COUNT(*)::int AS cnt FROM asset_purchases WHERE asset_id=$1', [asset.id]);
    if (existingBatches.rows[0].cnt === 0 && Number(asset.quantity || 0) > 0) {
      await client.query(
        `INSERT INTO asset_purchases(asset_id,purchase_date,quantity,purchase_price,bill_no,vendor_name,specifications,allocation,notes,bill_file_url,bill_file_name,is_opening,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12)`,
        [
          asset.id,
          asset.purchase_date || null,
          Number(asset.quantity || 1),
          Number(asset.purchase_price || 0),
          asset.bill_no || null,
          asset.vendor_name || null,
          asset.specifications || null,
          asset.allocation || null,
          'Existing / Opening Stock',
          asset.bill_file_url || null,
          asset.bill_file_name || null,
          asset.created_by || req.user.userId
        ]
      );
    }

    let billUrl = null;
    let billName = null;
    if (req.file) {
      const saved = saveInvoiceFile(`asset-${asset.id}-batch`, req.file);
      billUrl = saved.url;
      billName = saved.name;
    }

    const pDate = String(b.purchase_date || '').trim() || new Date().toISOString().slice(0, 10);
    const pRes = await client.query(
      `INSERT INTO asset_purchases(asset_id,purchase_date,quantity,purchase_price,bill_no,vendor_name,specifications,allocation,notes,bill_file_url,bill_file_name,is_opening,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,FALSE,$12) RETURNING *`,
      [
        asset.id,
        pDate,
        qty,
        price,
        String(b.bill_no || '').trim() || null,
        String(b.vendor_name || '').trim() || null,
        String(b.specifications || '').trim() || null,
        String(b.allocation || '').trim() || null,
        String(b.notes || '').trim() || null,
        billUrl,
        billName,
        req.user.userId
      ]
    );

    const updated = await client.query(
      `UPDATE assets
       SET quantity = COALESCE(quantity, 0) + $1,
           purchase_price = COALESCE(purchase_price, 0) + $2,
           book_value = COALESCE(book_value, 0) + $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [qty, price, asset.id]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, purchase: pRes.rows[0], asset: updated.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

router.delete('/:id/purchases/:purchaseId', asyncHandler(async (req, res) => {
  await schema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pRes = await client.query(
      'SELECT * FROM asset_purchases WHERE id=$1 AND asset_id=$2 FOR UPDATE',
      [req.params.purchaseId, req.params.id]
    );
    if (!pRes.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Purchase record not found' });
    }
    const batch = pRes.rows[0];
    if (batch.is_opening) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Opening stock record cannot be deleted directly.' });
    }

    await client.query('DELETE FROM asset_purchases WHERE id=$1', [batch.id]);
    const updated = await client.query(
      `UPDATE assets
       SET quantity = GREATEST(0, COALESCE(quantity, 0) - $1),
           purchase_price = GREATEST(0, COALESCE(purchase_price, 0) - $2),
           book_value = GREATEST(0, COALESCE(book_value, 0) - $2),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [Number(batch.quantity || 0), Number(batch.purchase_price || 0), req.params.id]
    );

    await client.query('COMMIT');
    res.json({ success: true, asset: updated.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

router.post('/:id/invoice', invoiceUpload, asyncHandler(async (req, res) => {
  await schema();
  if (!req.file) return res.status(400).json({ message: 'Choose a bill or invoice file.' });
  const asset = (await pool.query('SELECT id FROM assets WHERE id=$1', [req.params.id])).rows[0];
  if (!asset) return res.status(404).json({ message: 'Asset not found' });
  const saved = saveInvoiceFile(req.params.id, req.file);
  const result = await pool.query(
    'UPDATE assets SET bill_file_url=$1,bill_file_name=$2,updated_at=NOW() WHERE id=$3 RETURNING *',
    [saved.url, saved.name, req.params.id]
  );
  res.json({ success: true, asset: result.rows[0] });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  await schema();
  const b = req.body || {};
  const fields = [
    'allocation', 'custodian', 'status', 'name', 'category', 'vendor_name',
    'bill_no', 'purchase_date', 'annual_depreciation_rate', 'quantity', 'specifications'
  ];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const aRes = await client.query('SELECT * FROM assets WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!aRes.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Asset not found' });
    }

    let computedQty;
    if (b.opening_quantity !== undefined && b.opening_quantity !== '') {
      const oq = parseInt(b.opening_quantity, 10);
      if (!Number.isInteger(oq) || oq < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Valid opening quantity is required.' });
      }
      const existingOpening = await client.query(
        'SELECT id FROM asset_purchases WHERE asset_id=$1 AND is_opening=TRUE ORDER BY id ASC LIMIT 1',
        [req.params.id]
      );
      if (existingOpening.rowCount > 0) {
        await client.query('UPDATE asset_purchases SET quantity=$1 WHERE id=$2', [oq, existingOpening.rows[0].id]);
        const sumRes = await client.query('SELECT COALESCE(SUM(quantity), 0)::int AS total_qty FROM asset_purchases WHERE asset_id=$1', [req.params.id]);
        computedQty = sumRes.rows[0].total_qty;
      } else {
        computedQty = oq;
      }
    }

    const set = [];
    const values = [];
    for (const f of fields) {
      if (f === 'quantity' && computedQty !== undefined) continue;
      if (b[f] !== undefined) {
        values.push(b[f] === '' ? null : b[f]);
        set.push(`${f}=$${values.length}`);
      }
    }
    if (computedQty !== undefined) {
      values.push(computedQty);
      set.push(`quantity=$${values.length}`);
    }
    if (!set.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No changes supplied.' });
    }
    values.push(req.params.id);
    const r = await client.query(`UPDATE assets SET ${set.join(',')},updated_at=NOW() WHERE id=$${values.length} RETURNING *`, values);
    await client.query('COMMIT');
    res.json({ success: true, asset: r.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

router.post('/:id/depreciation', asyncHandler(async (req, res) => {
  await schema();
  const b = req.body || {};
  const asOf = new Date(b.as_of || new Date());
  const r = await pool.query('SELECT * FROM assets WHERE id=$1', [req.params.id]);
  if (!r.rowCount) return res.status(404).json({ message: 'Asset not found' });
  const a = r.rows[0];
  const bought = a.purchase_date ? new Date(a.purchase_date) : asOf;
  const years = Math.max(0, (asOf - bought) / (365.25 * 24 * 3600 * 1000));
  const rate = Number(b.annual_depreciation_rate ?? a.annual_depreciation_rate) || 0;
  const accumulated = Math.min(Number(a.purchase_price), (Number(a.purchase_price) * rate) / 100 * years);
  const book = Math.max(0, Number(a.purchase_price) - accumulated);
  const out = await pool.query(
    'UPDATE assets SET annual_depreciation_rate=$1,accumulated_depreciation=$2,book_value=$3,updated_at=NOW() WHERE id=$4 RETURNING *',
    [rate, accumulated, book, req.params.id]
  );
  res.json({ success: true, asset: out.rows[0] });
}));

router.post('/:id/maintenance', asyncHandler(async (req, res) => {
  await schema();
  const b = req.body || {};
  if (!String(b.description || '').trim()) return res.status(400).json({ message: 'Maintenance description is required.' });
  const r = await pool.query(
    'INSERT INTO asset_maintenance(asset_id,maintenance_date,description,cost,vendor_name,created_by) VALUES($1,COALESCE($2,CURRENT_DATE),$3,$4,$5,$6) RETURNING *',
    [req.params.id, b.maintenance_date, String(b.description).trim(), Number(b.cost || 0), b.vendor_name || null, req.user.userId]
  );
  res.status(201).json({ success: true, maintenance: r.rows[0] });
}));

router.post('/:id/disposal', asyncHandler(async (req, res) => {
  await schema();
  const b = req.body || {};
  const r = await pool.query(
    `UPDATE assets SET status='Disposed',disposal_date=COALESCE($1,CURRENT_DATE),disposal_price=$2,disposal_reason=$3,updated_at=NOW() WHERE id=$4 RETURNING *`,
    [b.disposal_date || null, Number(b.disposal_price || 0), b.disposal_reason || null, req.params.id]
  );
  if (!r.rowCount) return res.status(404).json({ message: 'Asset not found' });
  res.json({ success: true, asset: r.rows[0] });
}));

module.exports = router;
