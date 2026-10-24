require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const db = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Batas waktu pembayaran: 5 menit.
const CHECKOUT_TIMEOUT_MINUTES = 5;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

function autentikasiAdmin(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Silakan login sebagai admin terlebih dahulu.',
    });
  }

  const token = header.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== 'admin') {
      return res.status(403).json({
        message: 'Akses hanya untuk admin.',
      });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      message: 'Token tidak valid atau sudah kedaluwarsa.',
    });
  }
}


app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !JWT_SECRET) {
    return res.status(500).json({
      message: 'Konfigurasi autentikasi admin belum lengkap.',
    });
  }

  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    username !== ADMIN_USERNAME ||
    password !== ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      message: 'Username atau password salah.',
    });
  }

  const token = jwt.sign(
    {
      role: 'admin',
      username: ADMIN_USERNAME,
    },
    JWT_SECRET,
    {
      expiresIn: '2h',
    }
  );

  return res.json({
    message: 'Login admin berhasil.',
    token,
    expiresIn: '2h',
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'Backend Warung Nenek Yoyoh aktif!' });
});

// ========================
// TEST DATABASE
// ========================

app.get('/api/test-db', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW() AS waktu_database');

    res.json({
      message: 'Koneksi PostgreSQL berhasil!',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Database error:', error.message);
    res.status(500).json({
      message: 'Koneksi database gagal.',
    });
  }
});

// ========================
// KATALOG BARANG
// ========================

app.get('/api/barang', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM barang ORDER BY id ASC'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Gagal mengambil barang:', error.message);
    res.status(500).json({
      message: 'Gagal mengambil data barang.',
    });
  }
});

app.post('/api/barang', autentikasiAdmin, async (req, res) => {
  try {
    const {
      nama,
      kategori,
      harga,
      stok,
      satuan,
      foto,
      deskripsi,
    } = req.body;

    if (
      typeof nama !== 'string' ||
      !nama.trim() ||
      typeof kategori !== 'string' ||
      !kategori.trim() ||
      harga == null ||
      !Number.isFinite(Number(harga)) ||
      Number(harga) < 0 ||
      !Number.isSafeInteger(Number(stok ?? 0)) ||
      Number(stok ?? 0) < 0
    ) {
      return res.status(400).json({
        message: 'Data barang tidak valid.',
      });
    }

    const result = await db.query(
      `INSERT INTO barang (
        nama, kategori, harga, stok, satuan, foto, deskripsi
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        nama.trim(),
        kategori.trim(),
        Number(harga),
        Number(stok ?? 0),
        satuan ?? 'pcs',
        foto ?? null,
        deskripsi ?? null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Gagal menambahkan barang:', error.message);
    res.status(500).json({
      message: 'Gagal menambahkan barang.',
    });
  }
});

// EDIT BARANG
app.put('/api/barang/:id', autentikasiAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const {
      nama,
      kategori,
      harga,
      stok,
      satuan,
      foto,
      deskripsi,
    } = req.body;

    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      typeof nama !== 'string' ||
      !nama.trim() ||
      typeof kategori !== 'string' ||
      !kategori.trim() ||
      harga == null ||
      !Number.isFinite(Number(harga)) ||
      Number(harga) < 0 ||
      !Number.isSafeInteger(Number(stok ?? 0)) ||
      Number(stok ?? 0) < 0
    ) {
      return res.status(400).json({
        message: 'Data barang tidak valid.',
      });
    }

    const result = await db.query(
      `UPDATE barang
       SET nama = $1,
           kategori = $2,
           harga = $3,
           stok = $4,
           satuan = $5,
           foto = $6,
           deskripsi = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [
        nama.trim(),
        kategori.trim(),
        Number(harga),
        Number(stok ?? 0),
        satuan ?? 'pcs',
        foto ?? null,
        deskripsi ?? null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Barang tidak ditemukan.',
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Gagal memperbarui barang:', error.message);

    res.status(500).json({
      message: 'Gagal memperbarui barang.',
    });
  }
});

app.delete('/api/barang/:id', autentikasiAdmin, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({
      message: 'ID barang tidak valid.',
    });
  }

  try {
    const result = await db.query(
      'DELETE FROM barang WHERE id = $1 RETURNING id, nama',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Barang tidak ditemukan.',
      });
    }

    return res.json({
      message: 'Barang berhasil dihapus.',
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({
        message:
          'Barang tidak bisa dihapus karena sudah tercatat dalam riwayat pesanan.',
      });
    }

    console.error('Gagal menghapus barang:', error.message);
    return res.status(500).json({
      message: 'Terjadi kesalahan saat menghapus barang.',
    });
  }
});

// ========================
// TRANSAKSI DATABASE
// ========================

async function withTransaction(callback) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ========================
// KEDALUWARSA PESANAN
// ========================

// Batalkan pesanan yang kedaluwarsa dan pulihkan stok.
async function expireOrder(client, orderId) {
  const orderResult = await client.query(
    `SELECT *
     FROM pesanan
     WHERE id = $1
     FOR UPDATE`,
    [orderId]
  );

  const order = orderResult.rows[0];

  if (!order) return false;

  if (
    !['menunggu_pembayaran', 'menunggu_konfirmasi'].includes(
      order.status
    )
  ) {
    return false;
  }

  const expiredResult = await client.query(
    `SELECT batas_waktu <= NOW() AS expired
     FROM pesanan
     WHERE id = $1`,
    [orderId]
  );

  if (!order.batas_waktu || !expiredResult.rows[0]?.expired) {
    return false;
  }

  const reservations = await client.query(
    `SELECT id, barang_id, jumlah
     FROM reservasi_stok
     WHERE pesanan_id = $1
       AND status = 'aktif'
     ORDER BY barang_id
     FOR UPDATE`,
    [orderId]
  );

  for (const reservation of reservations.rows) {
    await client.query(
      `UPDATE barang
       SET stok = stok + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [reservation.jumlah, reservation.barang_id]
    );

    await client.query(
      `UPDATE reservasi_stok
       SET status = 'dilepas',
           diperbarui_pada = NOW()
       WHERE id = $1
         AND status = 'aktif'`,
      [reservation.id]
    );
  }

  await client.query(
    `UPDATE pesanan
     SET status = 'dibatalkan',
         diperbarui_pada = NOW()
     WHERE id = $1`,
    [orderId]
  );

  return true;
}

// ========================
// CHECKOUT
// ========================

app.post('/api/checkout', async (req, res) => {
  // Checkout tidak membutuhkan nama, nomor HP, atau alamat.
  const { metode_pembayaran, items } = req.body ?? {};

  if (!['QRIS', 'COD'].includes(metode_pembayaran)) {
    return res.status(400).json({
      message: 'Metode pembayaran harus QRIS atau COD.',
    });
  }

  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > 100
  ) {
    return res.status(400).json({
      message: 'Keranjang kosong atau jumlah jenis barang tidak valid.',
    });
  }

  // Gabungkan barang dengan ID yang sama.
  const quantities = new Map();

  for (const item of items) {
    const barangId = Number(item.barang_id);
    const jumlah = Number(item.jumlah);

    if (
      !Number.isSafeInteger(barangId) ||
      barangId <= 0 ||
      !Number.isSafeInteger(jumlah) ||
      jumlah <= 0 ||
      jumlah > 10000
    ) {
      return res.status(400).json({
        message: 'ID barang atau jumlah barang tidak valid.',
      });
    }

    const totalJumlah = (quantities.get(barangId) || 0) + jumlah;

    if (totalJumlah > 10000) {
      return res.status(400).json({
        message: 'Jumlah barang terlalu banyak.',
      });
    }

    quantities.set(barangId, totalJumlah);
  }

  try {
    const order = await withTransaction(async (client) => {
      const cart = [];

      // Kunci produk berdasarkan urutan ID untuk mengurangi
      // risiko konflik ketika beberapa checkout berlangsung bersamaan.
      const sortedItems = [...quantities.entries()].sort(
        ([idA], [idB]) => idA - idB
      );

      for (const [barangId, jumlah] of sortedItems) {
        const result = await client.query(
          `SELECT id, nama, harga, stok
           FROM barang
           WHERE id = $1
           FOR UPDATE`,
          [barangId]
        );

        const barang = result.rows[0];

        if (!barang) {
          const error = new Error(
            `Barang ID ${barangId} tidak ditemukan.`
          );
          error.statusCode = 400;
          throw error;
        }

        if (Number(barang.stok) < jumlah) {
          const error = new Error(
            `Stok ${barang.nama} tidak mencukupi. ` +
            `Stok tersedia: ${barang.stok}.`
          );
          error.statusCode = 409;
          throw error;
        }

        const harga = Number(barang.harga);
        const subtotal = harga * jumlah;

        if (
          !Number.isFinite(harga) ||
          harga < 0 ||
          !Number.isFinite(subtotal)
        ) {
          const error = new Error(
            `Harga barang ${barang.nama} tidak valid.`
          );
          error.statusCode = 400;
          throw error;
        }

        cart.push({
          barang_id: barang.id,
          nama: barang.nama,
          harga,
          jumlah,
          subtotal,
        });
      }

      const total = cart.reduce(
        (sum, item) => sum + item.subtotal,
        0
      );

      if (!Number.isFinite(total) || total > 999999999999) {
        const error = new Error('Total pesanan tidak valid.');
        error.statusCode = 400;
        throw error;
      }

      const kodePesanan =
        `WNY-${Date.now()}-` +
        crypto.randomBytes(4).toString('hex').toUpperCase();

      const statusAwal =
        metode_pembayaran === 'QRIS'
          ? 'menunggu_pembayaran'
          : 'menunggu_konfirmasi';

      // Nama, nomor HP, dan alamat disimpan sebagai NULL.
      const pesananResult = await client.query(
        `INSERT INTO pesanan (
          kode_pesanan,
          nama_pelanggan,
          no_hp,
          alamat,
          metode_pembayaran,
          status,
          total,
          batas_waktu
        )
        VALUES (
          $1, NULL, NULL, NULL, $2, $3, $4,
          NOW() + ($5 * INTERVAL '1 minute')
        )
        RETURNING *`,
        [
          kodePesanan,
          metode_pembayaran,
          statusAwal,
          total,
          CHECKOUT_TIMEOUT_MINUTES,
        ]
      );

      const pesanan = pesananResult.rows[0];

      for (const item of cart) {
        await client.query(
          `INSERT INTO detail_pesanan (
            pesanan_id,
            barang_id,
            nama_barang,
            harga,
            jumlah,
            subtotal
          )
          VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            pesanan.id,
            item.barang_id,
            item.nama,
            item.harga,
            item.jumlah,
            item.subtotal,
          ]
        );

        // Kurangi stok setelah validasi dan penguncian baris barang.
        const stockResult = await client.query(
          `UPDATE barang
           SET stok = stok - $1,
               updated_at = NOW()
           WHERE id = $2
             AND stok >= $1
           RETURNING id`,
          [item.jumlah, item.barang_id]
        );

        if (stockResult.rowCount !== 1) {
          const error = new Error(
            `Stok ${item.nama} berubah. Silakan checkout kembali.`
          );
          error.statusCode = 409;
          throw error;
        }

        await client.query(
          `INSERT INTO reservasi_stok (
            pesanan_id,
            barang_id,
            jumlah,
            status
          )
          VALUES ($1, $2, $3, 'aktif')`,
          [pesanan.id, item.barang_id, item.jumlah]
        );
      }

      return {
        kode_pesanan: pesanan.kode_pesanan,
        metode_pembayaran: pesanan.metode_pembayaran,
        status: pesanan.status,
        total: pesanan.total,
        batas_waktu: pesanan.batas_waktu,
        items: cart,
      };
    });

    return res.status(201).json({
      message: 'Pesanan berhasil dibuat.',
      pesanan: order,
    });
  } catch (error) {
    console.error('Checkout gagal:', error.message);

    return res.status(error.statusCode || 500).json({
      message: error.statusCode
        ? error.message
        : 'Checkout gagal karena kesalahan server.',
    });
  }
});

// ========================
// CEK STATUS PESANAN
// ========================

app.get('/api/admin/pesanan', autentikasiAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        p.id,
        p.kode_pesanan,
        p.nama_pelanggan,
        p.no_hp,
        p.alamat,
        p.metode_pembayaran,
        p.status,
        p.total,
        p.batas_waktu,
        p.dibuat_pada,
        COALESCE(
          json_agg(
            json_build_object(
              'barang_id', d.barang_id,
              'nama_barang', d.nama_barang,
              'harga', d.harga,
              'jumlah', d.jumlah,
              'subtotal', d.subtotal
            )
          ) FILTER (WHERE d.pesanan_id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM pesanan p
      LEFT JOIN detail_pesanan d ON d.pesanan_id = p.id
      GROUP BY p.id
      ORDER BY p.dibuat_pada DESC
      LIMIT 100
    `);

    res.json({
      message: 'Daftar pesanan berhasil diambil.',
      data: result.rows,
    });
  } catch (error) {
    console.error('Gagal mengambil pesanan admin:', error.message);

    res.status(500).json({
      message: 'Gagal mengambil daftar pesanan.',
    });
  }
});

app.get('/api/pesanan/:kode', async (req, res) => {
  try {
    const result = await withTransaction(async (client) => {
      const orderResult = await client.query(
        `SELECT *
         FROM pesanan
         WHERE kode_pesanan = $1
         FOR UPDATE`,
        [req.params.kode]
      );

      const order = orderResult.rows[0];

      if (!order) return null;

      // Jika sudah melewati batas waktu, batalkan dan pulihkan stok.
      await expireOrder(client, order.id);

      const refreshed = await client.query(
        `SELECT *
         FROM pesanan
         WHERE id = $1`,
        [order.id]
      );

      const details = await client.query(
        `SELECT barang_id, nama_barang, harga, jumlah, subtotal
         FROM detail_pesanan
         WHERE pesanan_id = $1
         ORDER BY id`,
        [order.id]
      );

      const pesanan = refreshed.rows[0];

      // Jangan mengirim informasi pribadi ke endpoint publik.
      return {
        kode_pesanan: pesanan.kode_pesanan,
        metode_pembayaran: pesanan.metode_pembayaran,
        status: pesanan.status,
        total: pesanan.total,
        batas_waktu: pesanan.batas_waktu,
        dibuat_pada: pesanan.dibuat_pada,
        diperbarui_pada: pesanan.diperbarui_pada,
        items: details.rows,
      };
    });

    if (!result) {
      return res.status(404).json({
        message: 'Pesanan tidak ditemukan.',
      });
    }

    return res.json({ pesanan: result });
  } catch (error) {
    console.error('Gagal mengambil status pesanan:', error.message);

    return res.status(500).json({
      message: 'Gagal mengambil status pesanan.',
    });
  }
});

// ========================
// KONFIRMASI COD
// ========================

app.post(
  '/api/pesanan/:kode/konfirmasi-cod',
  autentikasiAdmin,
  async (req, res) => {
  try {
    const result = await withTransaction(async (client) => {
      const orderResult = await client.query(
        `SELECT *
         FROM pesanan
         WHERE kode_pesanan = $1
         FOR UPDATE`,
        [req.params.kode]
      );

      const order = orderResult.rows[0];

      if (!order) {
        const error = new Error('Pesanan tidak ditemukan.');
        error.statusCode = 404;
        throw error;
      }

      await expireOrder(client, order.id);

      const currentResult = await client.query(
        'SELECT * FROM pesanan WHERE id = $1',
        [order.id]
      );

      const current = currentResult.rows[0];

      if (current.status === 'dibatalkan') {
        return { expired: true };
      }

      if (
        current.metode_pembayaran !== 'COD' ||
        current.status !== 'menunggu_konfirmasi'
      ) {
        const error = new Error(
          'Pesanan ini tidak sedang menunggu konfirmasi COD.'
        );
        error.statusCode = 409;
        throw error;
      }

      await client.query(
        `UPDATE pesanan
         SET status = 'diproses',
             batas_waktu = NULL,
             diperbarui_pada = NOW()
         WHERE id = $1`,
        [order.id]
      );

      await client.query(
        `UPDATE reservasi_stok
         SET status = 'terpakai',
             diperbarui_pada = NOW()
         WHERE pesanan_id = $1
           AND status = 'aktif'`,
        [order.id]
      );

      const updated = await client.query(
        'SELECT * FROM pesanan WHERE id = $1',
        [order.id]
      );

      return updated.rows[0];
    });

    if (result.expired) {
      return res.status(409).json({
        message: 'Pesanan sudah dibatalkan karena batas waktunya habis.',
        }
);
    }

    return res.json({
      message: 'Konfirmasi COD berhasil.',
      pesanan: {
        kode_pesanan: result.kode_pesanan,
        status: result.status,
        metode_pembayaran: result.metode_pembayaran,
        total: result.total,
      },
    });
  } catch (error) {
    console.error('Konfirmasi COD gagal:', error.message);

    return res.status(error.statusCode || 500).json({
      message: error.statusCode
        ? error.message
        : 'Konfirmasi COD gagal.',
    });
  }
});

app.patch(
  '/api/admin/pesanan/:kode/status',
  autentikasiAdmin,
  async (req, res) => {
    try {
      const { status } = req.body;

      const statusDiizinkan = ['selesai', 'dibatalkan'];

      if (!statusDiizinkan.includes(status)) {
        return res.status(400).json({
          message: 'Status tujuan tidak valid.',
        });
      }

      const result = await withTransaction(async (client) => {
        const orderResult = await client.query(
          `SELECT *
           FROM pesanan
           WHERE kode_pesanan = $1
           FOR UPDATE`,
          [req.params.kode]
        );

        const order = orderResult.rows[0];

        if (!order) {
          const error = new Error('Pesanan tidak ditemukan.');
          error.statusCode = 404;
          throw error;
        }

        if (order.status === 'selesai' || order.status === 'dibatalkan') {
          const error = new Error(
            'Pesanan sudah berstatus final dan tidak dapat diubah.'
          );
          error.statusCode = 409;
          throw error;
        }

        if (status === 'selesai' && order.status !== 'diproses') {
          const error = new Error(
            'Hanya pesanan yang sedang diproses yang dapat diselesaikan.'
          );
          error.statusCode = 409;
          throw error;
        }

        if (
          status === 'dibatalkan' &&
          !['menunggu_pembayaran', 'menunggu_konfirmasi'].includes(
            order.status
          )
        ) {
          const error = new Error(
            'Pesanan ini tidak dapat dibatalkan melalui tindakan ini.'
          );
          error.statusCode = 409;
          throw error;
        }

        if (status === 'dibatalkan') {
          await client.query(
            `UPDATE barang AS b
             SET stok = b.stok + r.jumlah,
                 updated_at = NOW()
             FROM reservasi_stok AS r
             WHERE r.pesanan_id = $1
               AND r.barang_id = b.id
               AND r.status = 'aktif'`,
            [order.id]
          );

          await client.query(
            `UPDATE reservasi_stok
             SET status = 'dilepas',
                 diperbarui_pada = NOW()
             WHERE pesanan_id = $1
               AND status = 'aktif'`,
            [order.id]
          );
        }

        const updatedResult = await client.query(
          `UPDATE pesanan
           SET status = $1,
               batas_waktu = NULL,
               diperbarui_pada = NOW()
           WHERE id = $2
           RETURNING *`,
          [status, order.id]
        );

        return updatedResult.rows[0];
      });

      return res.json({
        message: 'Status pesanan berhasil diperbarui.',
        pesanan: {
          kode_pesanan: result.kode_pesanan,
          status: result.status,
          metode_pembayaran: result.metode_pembayaran,
          total: result.total,
        },
      });
    } catch (error) {
      console.error('Perubahan status pesanan gagal:', error.message);

      return res.status(error.statusCode || 500).json({
        message: error.statusCode
          ? error.message
          : 'Perubahan status pesanan gagal.',
      });
    }
  }
);


// ========================
// PROSES KEDALUWARSA OTOMATIS
// ========================

let expiryJobRunning = false;

async function expirePendingOrders() {
  if (expiryJobRunning) return;

  expiryJobRunning = true;

  try {
    const result = await db.query(
      `SELECT id
       FROM pesanan
       WHERE status IN (
         'menunggu_pembayaran',
         'menunggu_konfirmasi'
       )
         AND batas_waktu <= NOW()
       ORDER BY batas_waktu
       LIMIT 100`
    );

    for (const row of result.rows) {
      try {
        await withTransaction(async (client) => {
          await expireOrder(client, row.id);
        });
      } catch (error) {
        console.error(
          `Gagal memproses kedaluwarsa pesanan ${row.id}:`,
          error.message
        );
      }
    }
  } catch (error) {
    console.error('Pengecekan kedaluwarsa gagal:', error.message);
  } finally {
    expiryJobRunning = false;
  }
}

// Periksa setiap 10 detik. Waktu kedaluwarsa sebenarnya
// tetap diperiksa berdasarkan waktu database.
const expiryTimer = setInterval(
  expirePendingOrders,
  10 * 1000
);

if (typeof expiryTimer.unref === 'function') {
  expiryTimer.unref();
}

// ========================
// START SERVER
// ========================

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Backend berjalan di http://localhost:${PORT}`);
});

// ========================
// SHUTDOWN
// ========================

async function shutdown() {
  console.log('\nMenutup server...');

  clearInterval(expiryTimer);

  server.close(async () => {
    try {
      await db.end();
      process.exit(0);
    } catch (error) {
      console.error('Gagal menutup koneksi database:', error.message);
      process.exit(1);
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);