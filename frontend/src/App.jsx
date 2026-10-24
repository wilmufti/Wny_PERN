
import { useCallback, useEffect, useMemo, useState } from 'react';

const API = 'http://localhost:3000/api';
const API_BARANG = `${API}/barang`;
const API_CHECKOUT = `${API}/checkout`;
const API_PESANAN = `${API}/pesanan`;

function formatRupiah(harga) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(harga) || 0);
}

function bacaKeranjang() {
  try {
    return JSON.parse(localStorage.getItem('keranjang-wny')) || [];
  } catch {
    return [];
  }
}

function formatWaktu(detik) {
  const menit = Math.floor(detik / 60);
  const sisaDetik = detik % 60;
  return `${String(menit).padStart(2, '0')}:${String(sisaDetik).padStart(2, '0')}`;
}

function labelStatus(status) {
  const labels = {
    menunggu_pembayaran: 'Menunggu Pembayaran',
    menunggu_konfirmasi: 'Menunggu Konfirmasi',
    dibayar: 'Pembayaran Berhasil',
    diproses: 'Pesanan Diproses',
    selesai: 'Pesanan Selesai',
    dibatalkan: 'Pesanan Dibatalkan',
  };

  return labels[status] || status || 'Status tidak diketahui';
}

async function kompresFoto(file) {
  const tipeDiizinkan = ['image/jpeg', 'image/png', 'image/webp'];

  if (!tipeDiizinkan.includes(file.type)) {
    throw new Error('Pilih foto berformat JPG, PNG, atau WebP.');
  }

  if (file.size > 12 * 1024 * 1024) {
    throw new Error('Ukuran foto maksimal 12 MB sebelum diproses.');
  }

  const bitmap = await createImageBitmap(file);

  try {
    const ukuranMaksimal = [1000, 850, 700, 550, 450];
    const kualitas = [0.82, 0.72, 0.62, 0.52, 0.42];

    for (const batasSisi of ukuranMaksimal) {
      const skala = Math.min(
        1,
        batasSisi / Math.max(bitmap.width, bitmap.height)
      );
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * skala));
      canvas.height = Math.max(1, Math.round(bitmap.height * skala));

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Foto gagal diproses oleh browser.');
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const kualitasJpeg of kualitas) {
        const hasil = canvas.toDataURL('image/jpeg', kualitasJpeg);
        if (hasil.length <= 700_000) return hasil;
      }
    }

    throw new Error(
      'Foto masih terlalu besar. Coba pilih foto dengan resolusi lebih kecil.'
    );
  } finally {
    bitmap.close?.();
  }
}

function App() {
  const [barang, setBarang] = useState([]);
  const [keranjang, setKeranjang] = useState(bacaKeranjang);
  const [pencarian, setPencarian] = useState('');
  const [kategoriAktif, setKategoriAktif] = useState('Semua');
  const [halaman, setHalaman] = useState('katalog');
  const [adminView, setAdminView] = useState('dashboard');
  const [barangDipilih, setBarangDipilih] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pesan, setPesan] = useState('');

  const [metodePembayaran, setMetodePembayaran] = useState('QRIS');
  const [pesananAktif, setPesananAktif] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [waktuSekarang, setWaktuSekarang] = useState(Date.now);
  const [memuatStatus, setMemuatStatus] = useState(false);
  const [formBarang, setFormBarang] = useState({
    nama: '',
    kategori: '',
    harga: '',
    stok: '',
    satuan: 'pcs',
    foto: '',
    deskripsi: '',
  });
  const [kategoriTambahan, setKategoriTambahan] = useState(() => {
    try {
      const data = JSON.parse(
        localStorage.getItem('wny-kategori-tambahan') || '[]'
      );
      return Array.isArray(data)
        ? data.filter(
            (kategori) =>
              typeof kategori === 'string' && kategori.trim().length > 0
          )
        : [];
    } catch {
      return [];
    }
  });
  const [kategoriBaruInput, setKategoriBaruInput] = useState('');
  const [tambahKategoriTerbuka, setTambahKategoriTerbuka] = useState(false);
  const [fotoDiproses, setFotoDiproses] = useState(false);
  const [barangEditId, setBarangEditId] = useState(null);

  const [tambahBarangLoading, setTambahBarangLoading] = useState(false);
  const [tambahBarangError, setTambahBarangError] = useState('');
  const [tambahBarangPesan, setTambahBarangPesan] = useState('');

  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [adminPesanan, setAdminPesanan] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');


  const ambilBarang = useCallback(async () => {
    try {
      const response = await fetch(API_BARANG);

      if (!response.ok) {
        throw new Error('Gagal mengambil data barang.');
      }

      const data = await response.json();
      setBarang(data);
      setError('');
    } catch {
      setError(
        'Data barang gagal dimuat. Pastikan backend dan database aktif.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch(API_BARANG, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Gagal mengambil data barang.');
        }

        return response.json();
      })
      .then((data) => {
        setBarang(data);
        setError('');
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(
            'Data barang gagal dimuat. Pastikan backend dan database aktif.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    localStorage.setItem('keranjang-wny', JSON.stringify(keranjang));
  }, [keranjang]);

  const daftarKategori = useMemo(
    () => ['Semua', ...new Set(barang.map((item) => item.kategori))],
    [barang]
  );

  const kategoriAdmin = useMemo(() => {
    const kategoriProduk = barang
      .map((item) => item.kategori)
      .filter(
        (kategori) => typeof kategori === 'string' && kategori.trim()
      );

    return [
      ...new Set([
        'Sembako',
        'Beras',
        'Minyak',
        'Mie',
        ...kategoriProduk,
        ...kategoriTambahan,
      ]),
    ];
  }, [barang, kategoriTambahan]);

  const hasilPencarian = barang.filter((item) => {
    const cocokPencarian = `${item.nama} ${item.kategori}`
      .toLowerCase()
      .includes(pencarian.toLowerCase());

    const cocokKategori =
      kategoriAktif === 'Semua' || item.kategori === kategoriAktif;

    return cocokPencarian && cocokKategori;
  });

  const jumlahBarang = keranjang.reduce(
    (total, item) => total + item.jumlah,
    0
  );

  const totalBelanja = keranjang.reduce(
    (total, item) => total + Number(item.harga) * item.jumlah,
    0
  );

  const tampilkanPesan = useCallback((teks) => {
    setPesan(teks);
    window.setTimeout(() => setPesan(''), 3000);
  }, []);

  function tambahKeKeranjang(item, jumlah = 1) {
    const stok = Number(item.stok) || 0;

    if (stok <= 0) {
      tampilkanPesan('Maaf, stok barang sedang habis.');
      return;
    }

    setKeranjang((sebelumnya) => {
      const ada = sebelumnya.find((x) => x.id === item.id);
      const jumlahSaatIni = ada ? ada.jumlah : 0;
      const jumlahBaru = jumlahSaatIni + jumlah;

      if (jumlahBaru > stok) {
        tampilkanPesan(`Stok ${item.nama} hanya ${stok} ${item.satuan}.`);
        return sebelumnya;
      }

      if (ada) {
        return sebelumnya.map((x) =>
          x.id === item.id ? { ...x, jumlah: jumlahBaru } : x
        );
      }

      return [
        ...sebelumnya,
        {
          id: item.id,
          nama: item.nama,
          kategori: item.kategori,
          harga: Number(item.harga),
          satuan: item.satuan,
          stok,
          foto: item.foto || null,
          jumlah,
        },
      ];
    });

    setBarangDipilih(null);
    tampilkanPesan(`${item.nama} ditambahkan ke keranjang.`);
  }

  function ubahJumlah(id, jumlahBaru) {
    if (jumlahBaru < 1) return;

    setKeranjang((sebelumnya) =>
      sebelumnya.map((item) => {
        if (item.id !== id) return item;

        if (jumlahBaru > item.stok) {
          tampilkanPesan(
            `Stok ${item.nama} hanya ${item.stok} ${item.satuan}.`
          );
          return item;
        }

        return { ...item, jumlah: jumlahBaru };
      })
    );
  }

  function hapusDariKeranjang(id) {
    setKeranjang((sebelumnya) =>
      sebelumnya.filter((item) => item.id !== id)
    );
    tampilkanPesan('Barang dihapus dari keranjang.');
  }

  function bukaKatalog() {
    setHalaman('katalog');
    setBarangDipilih(null);
  }

  function bukaKeranjang() {
    setHalaman('keranjang');
    setBarangDipilih(null);
  }

    function bukaKategori(nama) {
    const ditemukan = daftarKategori.find(
      (kategori) =>
        kategori.toLowerCase() === nama.toLowerCase()
    );

    setHalaman('katalog');
    setKategoriAktif(ditemukan || 'Semua');
    setBarangDipilih(null);
  }

  async function buatPesanan() {
    if (keranjang.length === 0 || checkoutLoading) return;

    setCheckoutLoading(true);

    try {
      const response = await fetch(API_CHECKOUT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metode_pembayaran: metodePembayaran,
          items: keranjang.map((item) => ({
            barang_id: item.id,
            jumlah: item.jumlah,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Checkout gagal.');
      }

      if (!data.pesanan?.kode_pesanan) {
        throw new Error('Server tidak mengembalikan kode pesanan.');
      }

      setWaktuSekarang(Date.now());
      setPesananAktif(data.pesanan);
      setKeranjang([]);
      setHalaman('pesanan');

      await ambilBarang();

      tampilkanPesan('Pesanan berhasil dibuat.');
    } catch (err) {
      tampilkanPesan(err.message || 'Gagal membuat pesanan.');
    } finally {
      setCheckoutLoading(false);
    }
  }

  const perbaruiStatusPesanan = useCallback(async () => {
    if (!pesananAktif?.kode_pesanan || memuatStatus) return;

    setMemuatStatus(true);

    try {
      const response = await fetch(
        `${API_PESANAN}/${encodeURIComponent(pesananAktif.kode_pesanan)}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Gagal mengambil status pesanan.');
      }

      if (data.pesanan) {
        setPesananAktif(data.pesanan);

        if (data.pesanan.status === 'dibatalkan') {
          await ambilBarang();
        }
      }
    } catch (err) {
      tampilkanPesan(err.message || 'Status pesanan gagal diperbarui.');
    } finally {
      setMemuatStatus(false);
    }
  }, [
    ambilBarang,
    memuatStatus,
    pesananAktif?.kode_pesanan,
    tampilkanPesan,
  ]);


async function loginAdmin(event) {
  event.preventDefault();
  setAdminLoading(true);
  setAdminError('');

  try {
    const response = await fetch(`${API}/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: adminUsername,
        password: adminPassword,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login admin gagal.');
    }

    setAdminToken(data.token);
    setAdminView('dashboard');
    setAdminPassword('');
    await ambilPesananAdmin(data.token);
  } catch (err) {
    setAdminError(err.message || 'Tidak dapat menghubungi backend.');
  } finally {
    setAdminLoading(false);
  }
}

async function ambilPesananAdmin(token = adminToken) {
  if (!token) return;

  setAdminLoading(true);
  setAdminError('');

  try {
    const response = await fetch(`${API}/admin/pesanan`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Gagal mengambil pesanan.');
    }

    setAdminPesanan(data.data || []);
  } catch (err) {
    setAdminError(err.message || 'Gagal mengambil daftar pesanan.');
  } finally {
    setAdminLoading(false);
  }
}

async function tambahBarang(event) {
  event.preventDefault();

  if (!adminToken) {
    setTambahBarangError('Silakan login sebagai admin.');
    return;
  }

  setTambahBarangLoading(true);
  setTambahBarangError('');
  setTambahBarangPesan('');

  try {
    const response = await fetch(API_BARANG, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        ...formBarang,
        harga: Number(formBarang.harga),
        stok: Number(formBarang.stok),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Gagal menambahkan barang.');
    }

    setTambahBarangPesan('Barang berhasil ditambahkan.');

    setFormBarang({
      nama: '',
      kategori: '',
      harga: '',
      stok: '',
      satuan: 'pcs',
      foto: '',
      deskripsi: '',
    });

    await ambilBarang();
  } catch (error) {
    setTambahBarangError(
      error.message || 'Tidak dapat menghubungi backend.'
    );
  } finally {
    setTambahBarangLoading(false);
  }
}

async function handleUploadFoto(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];

  if (!file) return;

  setFotoDiproses(true);
  setTambahBarangError('');
  setTambahBarangPesan('');

  try {
    const foto = await kompresFoto(file);
    setFormBarang((sebelumnya) => ({ ...sebelumnya, foto }));
    setTambahBarangPesan('Foto berhasil diproses.');
  } catch (error) {
    setTambahBarangError(error.message || 'Foto gagal diproses.');
  } finally {
    setFotoDiproses(false);
    input.value = '';
  }
}

function simpanKategoriBaru() {
  const nama = kategoriBaruInput.trim();

  if (!nama) {
    setTambahBarangError('Nama kategori belum diisi.');
    return;
  }

  const sudahAda = kategoriAdmin.find(
    (kategori) => kategori.toLowerCase() === nama.toLowerCase()
  );

  if (sudahAda) {
    setFormBarang((sebelumnya) => ({
      ...sebelumnya,
      kategori: sudahAda,
    }));
    setTambahKategoriTerbuka(false);
    setKategoriBaruInput('');
    setTambahBarangError('');
    return;
  }

  const daftarBaru = [...kategoriTambahan, nama];
  setKategoriTambahan(daftarBaru);

  try {
    localStorage.setItem(
      'wny-kategori-tambahan',
      JSON.stringify(daftarBaru)
    );
  } catch {
    tampilkanPesan('Kategori hanya tersedia selama sesi ini.');
  }

  setFormBarang((sebelumnya) => ({
    ...sebelumnya,
    kategori: nama,
  }));
  setKategoriBaruInput('');
  setTambahKategoriTerbuka(false);
  setTambahBarangError('');
}


const mulaiEditBarang = (barang) => {
  setBarangEditId(barang.id);

  setFormBarang({
    nama: barang.nama ?? '',
    kategori: barang.kategori ?? '',
    harga: String(barang.harga ?? ''),
    stok: String(barang.stok ?? ''),
    satuan: barang.satuan ?? '',
    foto: barang.foto ?? '',
    deskripsi: barang.deskripsi ?? '',
  });

  setTambahBarangError('');
  setTambahBarangPesan('');
};

const simpanEditBarang = async (event) => {
  event.preventDefault();

  if (!barangEditId) return;

  setTambahBarangLoading(true);
  setTambahBarangError('');
  setTambahBarangPesan('');

  try {
    const response = await fetch(`${API_BARANG}/${barangEditId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        ...formBarang,
        harga: Number(formBarang.harga),
        stok: Number(formBarang.stok),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Gagal memperbarui barang.');
    }

    await ambilBarang();

    setBarangEditId(null);
    setFormBarang({
      nama: '',
      kategori: '',
      harga: '',
      stok: '',
      satuan: '',
      foto: '',
      deskripsi: '',
    });

    setTambahBarangPesan('Barang berhasil diperbarui!');
  } catch (error) {
    setTambahBarangError(error.message || 'Terjadi kesalahan.');
  } finally {
    setTambahBarangLoading(false);
  }
};

async function hapusBarangAdmin(item) {
  const yakin = window.confirm(
    `Hapus barang "${item.nama}" dari katalog? Tindakan ini tidak bisa dibatalkan.`
  );

  if (!yakin) return;

  setAdminLoading(true);
  setAdminError('');

  try {
    const response = await fetch(`${API_BARANG}/${item.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Gagal menghapus barang.');
    }

    setKeranjang((sebelumnya) =>
      sebelumnya.filter((produk) => produk.id !== item.id)
    );
    await ambilBarang();

    if (barangEditId === item.id) {
      setBarangEditId(null);
      setFormBarang({
        nama: '',
        kategori: '',
        harga: '',
        stok: '',
        satuan: 'pcs',
        foto: '',
        deskripsi: '',
      });
    }

    tampilkanPesan('Barang berhasil dihapus.');
  } catch (error) {
    setAdminError(error.message || 'Gagal menghapus barang.');
  } finally {
    setAdminLoading(false);
  }
}

async function ubahStatusPesanan(pesanan, statusBaru) {
  const konfirmasi = {
    selesai: `Tandai pesanan ${pesanan.kode_pesanan} sebagai selesai?`,
    dibatalkan: `Batalkan pesanan ${pesanan.kode_pesanan}? Stok reservasi aktif akan dikembalikan.`,
  };

  if (!window.confirm(konfirmasi[statusBaru])) return;

  setAdminLoading(true);
  setAdminError('');

  try {
    const response = await fetch(
      `${API}/admin/pesanan/${encodeURIComponent(pesanan.kode_pesanan)}/status`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: statusBaru }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Gagal mengubah status pesanan.');
    }

    await ambilPesananAdmin(adminToken);
  } catch (err) {
    setAdminError(err.message || 'Terjadi kesalahan.');
  } finally {
    setAdminLoading(false);
  }
}

function logoutAdmin() {
  setAdminToken('');
  setAdminView('dashboard');
  setAdminUsername('');
  setAdminPassword('');
  setAdminPesanan([]);
  setAdminError('');
  setHalaman('katalog');
}

  const statusMenunggu = [
    'menunggu_pembayaran',
    'menunggu_konfirmasi',
  ].includes(pesananAktif?.status);

  // Periksa status secara berkala. Status final ditentukan backend.
  useEffect(() => {
    if (halaman !== 'pesanan' || !pesananAktif?.kode_pesanan) return;

    const statusFinal = [
      'dibayar',
      'diproses',
      'selesai',
      'dibatalkan',
    ].includes(pesananAktif.status);

    if (statusFinal) return;

    const interval = window.setInterval(() => {
      perbaruiStatusPesanan();
    }, 3000);

    return () => window.clearInterval(interval);
  }, [
    halaman,
    pesananAktif?.kode_pesanan,
    pesananAktif?.status,
    perbaruiStatusPesanan,
  ]);

  // Countdown hanya untuk pesanan yang masih menunggu.
  useEffect(() => {
    if (
      halaman !== 'pesanan' ||
      !statusMenunggu ||
      !pesananAktif?.batas_waktu
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setWaktuSekarang(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [
    halaman,
    pesananAktif?.batas_waktu,
    statusMenunggu,
  ]);

  const detikTersisa =
    statusMenunggu && pesananAktif?.batas_waktu
      ? Math.max(
          0,
          Math.ceil(
            (new Date(pesananAktif.batas_waktu).getTime() - waktuSekarang) /
              1000
          )
        )
      : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header
        className={`store-topbar ${halaman === 'admin' ? 'admin-topbar' : ''}`}
      >
          <button
            onClick={bukaKatalog}
            className="store-brand"
            aria-label="Kembali ke menu"
          >
            <span className="store-brand-icon">🛍️</span>
            <span className="store-brand-copy">
              <strong>Warung</strong>
              <span>Nenek Yoyoh</span>
            </span>
          </button>

          {halaman !== 'admin' && (
            <label className="store-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={pencarian}
                onChange={(event) => setPencarian(event.target.value)}
                placeholder="Mencari barang"
                aria-label="Mencari barang"
              />
            </label>
          )}

          <div className="store-top-actions">
            {halaman === 'admin' && adminToken ? (
              <button
                type="button"
                className="top-logout-button"
                onClick={logoutAdmin}
              >
                Keluar
              </button>
            ) : (
              <button
                className="top-icon-button"
                onClick={() => {
                  setAdminError('');
                  setHalaman('admin');
                }}
                aria-label="Admin"
                title="Admin"
              >
                ♙
              </button>
            )}

            <button
              className="top-icon-button cart-icon-button"
              onClick={bukaKeranjang}
              aria-label="Keranjang belanja"
              title="Keranjang"
            >
              🛒
              <span className="cart-badge">{jumlahBarang}</span>
            </button>
          </div>
      </header>

      {pesan && (
        <div
          role="status"
          className="fixed right-4 top-24 z-50 max-w-sm rounded-xl bg-slate-900 px-5 py-3 text-sm text-white shadow-lg"
        >
          {pesan}
        </div>
      )}

      <main
        className={`store-layout ${
          halaman === 'admin'
            ? adminToken
              ? 'admin-layout'
              : 'login-layout'
            : 'customer-layout'
        }`}
      >
        {halaman === 'admin' && adminToken && (
          <aside className="store-sidebar">
            <nav className="sidebar-nav">
              <button
                className={`side-link ${adminView === 'dashboard' ? 'active' : ''}`}
                onClick={() => setAdminView('dashboard')}
              >
                <span className="side-icon">▦</span>
                <span>Panel Admin</span>
              </button>
              <button
                className={`side-link ${adminView === 'barang' ? 'active' : ''}`}
                onClick={() => setAdminView('barang')}
              >
                <span className="side-icon">📦</span>
                <span>Kelola Barang</span>
              </button>
              <button
                className={`side-link ${adminView === 'tambah' ? 'active' : ''}`}
                onClick={() => setAdminView('tambah')}
              >
                <span className="side-icon">＋</span>
                <span>Tambah Barang</span>
              </button>
              <button
                className={`side-link ${adminView === 'pesanan' ? 'active' : ''}`}
                onClick={() => setAdminView('pesanan')}
              >
                <span className="side-icon">🧾</span>
                <span>Daftar Pesanan</span>
              </button>
            </nav>
          </aside>
        )}

        <div className="store-content">
          {/* ================= KATALOG PELANGGAN ================= */}
          {halaman === 'katalog' && (
            <section className="customer-catalog">
              <div className="customer-hero">
                <div className="customer-hero-copy">
                  <span className="customer-hero-kicker">
                    WARUNG NENEK YOYOH
                  </span>
                  <h1>
                    Belanja harian,
                    <br />
                    jadi lebih mudah.
                  </h1>
                  <p>
                    Temukan kebutuhan rumah tangga, cek harga dan stok,
                    lalu tambahkan barang ke keranjang dengan mudah.
                  </p>
                  <button
                    type="button"
                    className="customer-hero-button"
                    onClick={() =>
                      document
                        .getElementById('customer-products')
                        ?.scrollIntoView({ behavior: 'smooth' })
                    }
                  >
                    Mulai Belanja <span aria-hidden="true">↓</span>
                  </button>
                  <div className="customer-hero-benefits">
                    <span>✓ Harga terlihat jelas</span>
                    <span>✓ Informasi stok tersedia</span>
                  </div>
                </div>

                <div className="customer-hero-art" aria-hidden="true">
                  <div className="customer-hero-circle" />
                  <div className="customer-hero-bag">🛍️</div>
                  <span className="customer-hero-float float-one">🌾</span>
                  <span className="customer-hero-float float-two">🍜</span>
                  <span className="customer-hero-float float-three">🫒</span>
                </div>
              </div>

              <div className="customer-category-section">
                <div className="customer-section-heading">
                  <div>
                    <h2>Mau belanja apa?</h2>
                    <p>Pilih kategori untuk menemukan barang yang kamu cari.</p>
                  </div>
                </div>

                <div className="customer-category-list">
                  {daftarKategori.map((kategori) => {
                    const nama = kategori.toLowerCase();
                    const ikon =
                      nama === 'semua'
                        ? '▦'
                        : nama.includes('beras')
                          ? '🌾'
                          : nama.includes('minyak')
                            ? '🫒'
                            : nama.includes('mie')
                              ? '🍜'
                              : nama.includes('sembako')
                                ? '🧺'
                                : '🛍️';

                    return (
                      <button
                        key={kategori}
                        type="button"
                        onClick={() => bukaKategori(kategori)}
                        className={`customer-category-chip ${
                          kategoriAktif === kategori ? 'selected' : ''
                        }`}
                        aria-pressed={kategoriAktif === kategori}
                      >
                        <span className="customer-category-icon" aria-hidden="true">
                          {ikon}
                        </span>
                        <span>{kategori}</span>
                        {kategoriAktif === kategori && (
                          <span className="customer-category-check">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                id="customer-products"
                className="customer-products-section"
              >
                <div className="customer-section-heading products-heading">
                  <div>
                    <h2>Produk pilihan</h2>
                    <p>Pilih barang yang kamu butuhkan hari ini.</p>
                  </div>
                  <span className="customer-product-count">
                    {hasilPencarian.length} produk
                  </span>
                </div>

                {loading ? (
                  <div className="customer-state-message">
                    <span className="customer-loading-icon">🛍️</span>
                    <p>Sedang memuat produk...</p>
                  </div>
                ) : error ? (
                  <div className="customer-state-message customer-error">
                    <p>{error}</p>
                    <button type="button" onClick={ambilBarang}>
                      Coba lagi
                    </button>
                  </div>
                ) : hasilPencarian.length === 0 ? (
                  <div className="customer-state-message">
                    <span className="customer-loading-icon">🔎</span>
                    <h3>Barang belum ditemukan</h3>
                    <p>Coba kata pencarian atau kategori lainnya.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setPencarian('');
                        setKategoriAktif('Semua');
                      }}
                    >
                      Lihat semua produk
                    </button>
                  </div>
                ) : (
                  <div className="customer-products-grid">
                    {hasilPencarian.map((item) => {
                      const stokTersedia = Number(item.stok) > 0;
                      const namaKategori = (item.kategori || '').toLowerCase();
                      const ikonProduk = namaKategori.includes('beras')
                        ? '🌾'
                        : namaKategori.includes('minyak')
                          ? '🫒'
                          : namaKategori.includes('mie')
                            ? '🍜'
                            : namaKategori.includes('sembako')
                              ? '🧺'
                              : '🛍️';

                      return (
                        <article
                          key={item.id}
                          className="customer-product-card"
                        >
                          <button
                            type="button"
                            className="customer-product-visual"
                            onClick={() => setBarangDipilih(item)}
                            aria-label={`Lihat detail ${item.nama}`}
                          >
                            {item.foto ? (
                              <img
                                src={item.foto}
                                alt={item.nama}
                                loading="lazy"
                              />
                            ) : (
                              <div className="customer-product-placeholder">
                                <span>{ikonProduk}</span>
                                <small>
                                  {item.kategori || 'Produk pilihan'}
                                </small>
                              </div>
                            )}
                            <span
                              className={`customer-stock-badge ${
                                stokTersedia ? 'in-stock' : 'out-stock'
                              }`}
                            >
                              {stokTersedia ? 'Tersedia' : 'Stok habis'}
                            </span>
                          </button>

                          <div className="customer-product-body">
                            <span className="customer-product-category">
                              {item.kategori || 'Lainnya'}
                            </span>
                            <button
                              type="button"
                              className="customer-product-name"
                              onClick={() => setBarangDipilih(item)}
                              title={item.nama}
                            >
                              {item.nama}
                            </button>
                            <div className="customer-product-price">
                              <strong>{formatRupiah(item.harga)}</strong>
                              <span>/ {item.satuan}</span>
                            </div>
                            <div className="customer-product-footer">
                              <span className="customer-stock-text">
                                Stok: {item.stok} {item.satuan}
                              </span>
                              <button
                                type="button"
                                className="customer-add-button"
                                onClick={() => tambahKeKeranjang(item)}
                                disabled={!stokTersedia}
                                aria-label={`Tambah ${item.nama} ke keranjang`}
                              >
                                <span aria-hidden="true">+</span>
                                <span>Tambah</span>
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {halaman === 'keranjang' && (
            <section className="customer-cart-page">
              <div className="customer-cart-heading">
                <div className="customer-cart-title-row">
                  <div>
                    <h1>Keranjang Belanja</h1>
                    <p>Periksa barang pilihanmu sebelum melanjutkan.</p>
                  </div>
                  <button
                    type="button"
                    className="customer-back-button"
                    onClick={bukaKatalog}
                  >
                    <span aria-hidden="true">←</span>
                    Kembali Belanja
                  </button>
                </div>
              </div>

              {keranjang.length === 0 ? (
                <div className="customer-cart-empty">
                  <div className="customer-cart-empty-icon" aria-hidden="true">
                    🛍️
                  </div>
                  <h2>Keranjangmu masih kosong</h2>
                  <p>
                    Belum ada barang yang dipilih. Yuk, cari kebutuhan
                    sehari-hari yang kamu perlukan.
                  </p>
                  <button
                    type="button"
                    className="customer-cart-primary"
                    onClick={bukaKatalog}
                  >
                    Mulai Belanja
                  </button>
                </div>
              ) : (
                <div className="customer-cart-layout">
                  <div className="customer-cart-main">
                    <div className="customer-cart-list-heading">
                      <div>
                        <h2>Barang Pilihan</h2>
                        <p>{jumlahBarang} barang dalam keranjang</p>
                      </div>
                      <span className="customer-cart-count">
                        {keranjang.length} produk
                      </span>
                    </div>

                    <div className="customer-cart-list">
                      {keranjang.map((item) => (
                        <article
                          key={item.id}
                          className="customer-cart-item"
                        >
                          <div className="customer-cart-item-image">
                            {item.foto ? (
                              <img src={item.foto} alt={item.nama} />
                            ) : (
                              <span aria-hidden="true">
                                {item.kategori?.toLowerCase().includes('beras')
                                  ? '🌾'
                                  : item.kategori?.toLowerCase().includes('minyak')
                                    ? '🫒'
                                    : item.kategori?.toLowerCase().includes('mie')
                                      ? '🍜'
                                      : '🛍️'}
                              </span>
                            )}
                          </div>

                          <div className="customer-cart-item-info">
                            <span className="customer-cart-item-category">
                              {item.kategori || 'Produk pilihan'}
                            </span>
                            <h3>{item.nama}</h3>
                            <p className="customer-cart-unit-price">
                              {formatRupiah(item.harga)} / {item.satuan}
                            </p>
                            <strong className="customer-cart-line-total">
                              {formatRupiah(item.harga * item.jumlah)}
                            </strong>
                          </div>

                          <div className="customer-cart-item-actions">
                            <div className="customer-quantity-control">
                              <button
                                type="button"
                                onClick={() =>
                                  item.jumlah === 1
                                    ? hapusDariKeranjang(item.id)
                                    : ubahJumlah(item.id, item.jumlah - 1)
                                }
                                aria-label={`Kurangi jumlah ${item.nama}`}
                              >
                                −
                              </button>
                              <span>{item.jumlah}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  ubahJumlah(item.id, item.jumlah + 1)
                                }
                                disabled={item.jumlah >= item.stok}
                                aria-label={`Tambah jumlah ${item.nama}`}
                              >
                                +
                              </button>
                            </div>

                            <button
                              type="button"
                              className="customer-cart-remove"
                              onClick={() => hapusDariKeranjang(item.id)}
                              aria-label={`Hapus ${item.nama} dari keranjang`}
                            >
                              <span aria-hidden="true">×</span>
                              Hapus
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>

                  </div>

                  <aside className="customer-cart-summary">
                    <div className="customer-cart-summary-heading">
                      <div>
                        <h2>Ringkasan Belanja</h2>
                        <p>Rincian total belanja kamu</p>
                      </div>
                      <span aria-hidden="true">▤</span>
                    </div>

                    <div className="customer-cart-summary-row">
                      <span>Jumlah barang</span>
                      <strong>{jumlahBarang} item</strong>
                    </div>
                    <div className="customer-cart-summary-row">
                      <span>Jenis produk</span>
                      <strong>{keranjang.length} produk</strong>
                    </div>
                    <div className="customer-cart-summary-divider" />

                    <div className="customer-cart-grand-total">
                      <span>Total belanja</span>
                      <strong>{formatRupiah(totalBelanja)}</strong>
                    </div>
                    <p className="customer-cart-summary-note">
                      Harga dan stok akan diperiksa kembali saat pesanan
                      dibuat.
                    </p>
                    <button
                      type="button"
                      className="customer-cart-primary"
                      onClick={() => setHalaman('checkout')}
                    >
                      Lanjutkan Checkout
                      <span aria-hidden="true">→</span>
                    </button>
                    <div className="customer-cart-safe-note">
                      <span aria-hidden="true">✓</span>
                      Periksa pesanan sebelum melakukan pembayaran
                    </div>
                  </aside>
                </div>
              )}
            </section>
          )}

          {halaman === 'checkout' && (
            <section className="customer-checkout-page">
              <header className="customer-checkout-heading">
                <div>
                  <span className="customer-checkout-eyebrow">
                    LANGKAH TERAKHIR
                  </span>
                  <h1>Checkout</h1>
                  <p>
                    Periksa pesanan dan pilih metode pembayaran sebelum
                    membuat pesanan.
                  </p>
                </div>
                <button
                  type="button"
                  className="customer-page-back"
                  onClick={bukaKeranjang}
                >
                  <span aria-hidden="true">←</span>
                  Kembali ke Keranjang
                </button>
              </header>

              {keranjang.length === 0 ? (
                <div className="customer-checkout-empty">
                  <span aria-hidden="true">🛒</span>
                  <h2>Keranjang masih kosong</h2>
                  <p>Tambahkan barang terlebih dahulu sebelum checkout.</p>
                  <button
                    type="button"
                    className="customer-checkout-primary"
                    onClick={bukaKatalog}
                  >
                    Mulai Belanja
                  </button>
                </div>
              ) : (
                <div className="customer-checkout-layout">
                  <div className="customer-checkout-main">
                    <section className="customer-checkout-panel">
                      <div className="customer-checkout-panel-heading">
                        <span className="customer-checkout-step">01</span>
                        <div>
                          <h2>Metode Pembayaran</h2>
                          <p>Pilih salah satu metode pembayaran.</p>
                        </div>
                      </div>

                      <div className="customer-payment-options">
                        <label
                          className={`customer-payment-option ${
                            metodePembayaran === 'QRIS' ? 'selected' : ''
                          }`}
                        >
                          <input
                            type="radio"
                            name="metode"
                            value="QRIS"
                            checked={metodePembayaran === 'QRIS'}
                            onChange={() => setMetodePembayaran('QRIS')}
                          />
                          <span className="customer-payment-icon qris-icon">
                            ▦
                          </span>
                          <span className="customer-payment-copy">
                            <strong>QRIS</strong>
                            <span>
                              Pembayaran menggunakan QRIS resmi dari warung.
                            </span>
                          </span>
                          <span className="customer-payment-radio" />
                        </label>

                        <label
                          className={`customer-payment-option ${
                            metodePembayaran === 'COD' ? 'selected' : ''
                          }`}
                        >
                          <input
                            type="radio"
                            name="metode"
                            value="COD"
                            checked={metodePembayaran === 'COD'}
                            onChange={() => setMetodePembayaran('COD')}
                          />
                          <span className="customer-payment-icon cod-icon">
                            🏪
                          </span>
                          <span className="customer-payment-copy">
                            <strong>COD / Tunai di Warung</strong>
                            <span>
                              Bayar langsung kepada penjaga warung.
                            </span>
                          </span>
                          <span className="customer-payment-radio" />
                        </label>
                      </div>

                      <div className="customer-payment-notice">
                        <span aria-hidden="true">ⓘ</span>
                        <p>
                          {metodePembayaran === 'QRIS'
                            ? 'Gunakan QRIS resmi yang disediakan warung. Pembayaran perlu dikonfirmasi dan tidak terverifikasi otomatis oleh aplikasi.'
                            : 'Siapkan pembayaran tunai dan temui penjaga warung agar pembayaran dapat dikonfirmasi.'}
                        </p>
                      </div>

                      <div className="customer-checkout-deadline">
                        <span aria-hidden="true">◷</span>
                        <div>
                          <strong>Batas waktu pembayaran 5 menit</strong>
                          <p>Waktu dimulai setelah pesanan berhasil dibuat.</p>
                        </div>
                      </div>
                    </section>

                    <section className="customer-checkout-panel">
                      <div className="customer-checkout-panel-heading">
                        <span className="customer-checkout-step">02</span>
                        <div>
                          <h2>Barang yang Dipesan</h2>
                          <p>
                            {jumlahBarang} item dari {keranjang.length} jenis
                            produk.
                          </p>
                        </div>
                      </div>

                      <div className="customer-checkout-items">
                        {keranjang.map((item) => (
                          <div
                            key={item.id}
                            className="customer-checkout-item"
                          >
                            <div className="customer-checkout-item-image">
                              {item.foto ? (
                                <img src={item.foto} alt={item.nama} />
                              ) : (
                                <span aria-hidden="true">🛍️</span>
                              )}
                            </div>
                            <div className="customer-checkout-item-copy">
                              <strong>{item.nama}</strong>
                              <span>
                                {formatRupiah(item.harga)} / {item.satuan}
                              </span>
                              <small>Jumlah: {item.jumlah}</small>
                            </div>
                            <strong className="customer-checkout-item-total">
                              {formatRupiah(item.harga * item.jumlah)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <aside className="customer-checkout-summary">
                    <div className="customer-checkout-summary-top">
                      <span>RINGKASAN PESANAN</span>
                      <div className="customer-checkout-summary-icon">✓</div>
                    </div>
                    <h2>Hampir selesai!</h2>
                    <p className="customer-checkout-summary-description">
                      Pastikan pilihan pembayaran dan jumlah belanja sudah
                      sesuai.
                    </p>
                    <div className="customer-checkout-summary-row">
                      <span>Jumlah barang</span>
                      <strong>{jumlahBarang} item</strong>
                    </div>
                    <div className="customer-checkout-summary-row">
                      <span>Jenis produk</span>
                      <strong>{keranjang.length} produk</strong>
                    </div>
                    <div className="customer-checkout-summary-row">
                      <span>Pembayaran</span>
                      <strong>{metodePembayaran}</strong>
                    </div>
                    <div className="customer-checkout-summary-divider" />
                    <div className="customer-checkout-total">
                      <span>Total pembayaran</span>
                      <strong>{formatRupiah(totalBelanja)}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={buatPesanan}
                      disabled={checkoutLoading || keranjang.length === 0}
                      className="customer-checkout-primary"
                    >
                      {checkoutLoading
                        ? 'Membuat pesanan...'
                        : 'Buat Pesanan'}
                      {!checkoutLoading && (
                        <span aria-hidden="true">→</span>
                      )}
                    </button>
                    <p className="customer-checkout-terms">
                      Dengan membuat pesanan, kamu dapat memeriksa status
                      pembayaran melalui halaman detail pesanan.
                    </p>
                  </aside>
                </div>
              )}
            </section>
          )}

          {halaman === 'pesanan' && pesananAktif && (
            <section className="customer-order-page">
              <header className="customer-order-heading">
                <div>
                  <span className="customer-order-eyebrow">
                    INFORMASI PESANAN
                  </span>
                  <h1>Detail Pesanan</h1>
                  <p>
                    Simpan kode pesanan untuk memeriksa status transaksi kamu.
                  </p>
                </div>
                <button
                  type="button"
                  className="customer-page-back"
                  onClick={async () => {
                    await ambilBarang();
                    bukaKatalog();
                  }}
                >
                  <span aria-hidden="true">←</span>
                  Kembali ke Katalog
                </button>
              </header>

              <section className="customer-order-status-card">
                <div className="customer-order-status-top">
                  <div className="customer-order-status-symbol">
                    {pesananAktif.status === 'dibatalkan'
                      ? '×'
                      : ['dibayar', 'diproses', 'selesai'].includes(
                          pesananAktif.status
                        )
                        ? '✓'
                        : '◷'}
                  </div>
                  <div className="customer-order-status-copy">
                    <span>Status pesanan</span>
                    <h2>{labelStatus(pesananAktif.status)}</h2>
                    <p>
                      {pesananAktif.status === 'dibatalkan'
                        ? 'Pesanan ini telah dibatalkan.'
                        : pesananAktif.status === 'selesai'
                          ? 'Pesanan telah selesai diproses.'
                          : pesananAktif.status === 'diproses'
                            ? 'Pesanan sedang diproses oleh warung.'
                            : pesananAktif.status === 'dibayar'
                              ? 'Pembayaran telah tercatat.'
                              : pesananAktif.status === 'menunggu_konfirmasi'
                                ? 'Menunggu konfirmasi pembayaran dari warung.'
                                : 'Selesaikan pembayaran sebelum batas waktunya.'}
                    </p>
                  </div>
                  <span
                    className={`customer-order-status-badge status-${pesananAktif.status}`}
                  >
                    {labelStatus(pesananAktif.status)}
                  </span>
                </div>

                <div className="customer-order-status-meta">
                  <div>
                    <span>Metode pembayaran</span>
                    <strong>
                      {pesananAktif.metode_pembayaran === 'QRIS'
                        ? 'QRIS'
                        : 'COD / Tunai di Warung'}
                    </strong>
                  </div>
                  <div>
                    <span>Total pesanan</span>
                    <strong>{formatRupiah(pesananAktif.total)}</strong>
                  </div>
                </div>

                <div className="customer-order-code">
                  <div>
                    <span>Kode pesanan</span>
                    <strong>{pesananAktif.kode_pesanan}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (navigator.clipboard?.writeText) {
                        navigator.clipboard
                          .writeText(pesananAktif.kode_pesanan)
                          .then(() => tampilkanPesan('Kode pesanan disalin.'))
                          .catch(() =>
                            tampilkanPesan(
                              `Kode pesanan: ${pesananAktif.kode_pesanan}`
                            )
                          );
                      } else {
                        tampilkanPesan(
                          `Kode pesanan: ${pesananAktif.kode_pesanan}`
                        );
                      }
                    }}
                  >
                    Salin kode
                  </button>
                </div>
              </section>

              {statusMenunggu && (
                <section
                  className={`customer-order-timer ${
                    detikTersisa <= 0 ? 'timer-expired' : ''
                  }`}
                >
                  <div className="customer-order-timer-icon" aria-hidden="true">
                    ◷
                  </div>
                  <div className="customer-order-timer-copy">
                    <h3>
                      {detikTersisa > 0
                        ? 'Selesaikan pembayaran'
                        : 'Batas waktu pembayaran habis'}
                    </h3>
                    <p>
                      {detikTersisa > 0
                        ? pesananAktif.metode_pembayaran === 'QRIS'
                          ? 'Gunakan QRIS resmi dari warung. Pembayaran belum otomatis terverifikasi.'
                          : 'Temui penjaga warung untuk membayar tunai dan meminta konfirmasi.'
                        : 'Pesanan sedang menunggu pembaruan status dari server.'}
                    </p>
                  </div>
                  <div className="customer-order-countdown">
                    <span>Sisa waktu</span>
                    <strong>{formatWaktu(detikTersisa)}</strong>
                  </div>
                </section>
              )}

              {pesananAktif.status === 'dibatalkan' && (
                <div className="customer-order-message cancelled-message">
                  <strong>Pesanan dibatalkan</strong>
                  <p>
                    Pesanan sudah dibatalkan. Stok yang sebelumnya dicadangkan
                    akan ditangani oleh backend.
                  </p>
                </div>
              )}

              {['dibayar', 'diproses', 'selesai'].includes(
                pesananAktif.status
              ) && (
                <div className="customer-order-message success-message">
                  <strong>Informasi pesanan diperbarui</strong>
                  <p>
                    Status pesanan ini sudah tercatat pada sistem warung.
                  </p>
                </div>
              )}

              <section className="customer-order-items-panel">
                <div className="customer-order-panel-heading">
                  <div>
                    <h2>Rincian Barang</h2>
                    <p>Daftar barang yang ada dalam pesanan ini.</p>
                  </div>
                  <span className="customer-order-items-count">
                    {(pesananAktif.items || []).length} produk
                  </span>
                </div>

                <div className="customer-order-items-list">
                  {(pesananAktif.items || []).map((item, index) => (
                    <div
                      key={`${item.barang_id}-${index}`}
                      className="customer-order-item"
                    >
                      <div className="customer-order-item-icon" aria-hidden="true">
                        🛍️
                      </div>
                      <div className="customer-order-item-copy">
                        <strong>{item.nama_barang || item.nama}</strong>
                        <span>Jumlah: {item.jumlah}</span>
                      </div>
                      <strong className="customer-order-item-price">
                        {formatRupiah(
                          item.subtotal ??
                            Number(item.harga) * Number(item.jumlah)
                        )}
                      </strong>
                    </div>
                  ))}
                </div>

                <div className="customer-order-total-row">
                  <span>Total pembayaran</span>
                  <strong>{formatRupiah(pesananAktif.total)}</strong>
                </div>
              </section>

              <div className="customer-order-actions">
                <button
                  type="button"
                  className="customer-order-refresh"
                  onClick={perbaruiStatusPesanan}
                  disabled={memuatStatus}
                >
                  <span aria-hidden="true">↻</span>
                  {memuatStatus
                    ? 'Memeriksa status...'
                    : 'Perbarui Status'}
                </button>
                <button
                  type="button"
                  className="customer-order-return"
                  onClick={async () => {
                    await ambilBarang();
                    bukaKatalog();
                  }}
                >
                  Kembali ke Katalog
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </section>
          )}

          {halaman === 'admin' && (
            <section>
              {!adminToken ? (
                <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6">
                  <h2 className="page-heading">Login Admin</h2>
                  <form className="mt-5 space-y-4" onSubmit={loginAdmin}>
                    <label className="block text-sm font-medium">
                      Username
                      <input className="mt-1 w-full rounded-lg border border-slate-300 p-3" value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} required autoComplete="username" />
                    </label>
                    <label className="block text-sm font-medium">
                      Password
                      <input className="mt-1 w-full rounded-lg border border-slate-300 p-3" type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} required autoComplete="current-password" />
                    </label>
                    {adminError && <p role="alert" className="error-message">{adminError}</p>}
                    <button className="checkout-button" disabled={adminLoading}>
                      {adminLoading ? 'Memproses...' : 'Login'}
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  {adminError && <p role="alert" className="error-message mt-3">{adminError}</p>}
                  {adminView === 'dashboard' && (
                    <section id="admin-panel" className="mt-5">
                      <div className="mb-5">
                        <h3 className="text-xl font-bold">Ringkasan Dashboard</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Ringkasan produk dan seluruh status pesanan warung.
                        </p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5">
                          <p className="text-sm text-slate-500">Total Barang</p>
                          <p className="mt-2 text-3xl font-bold">{barang.length}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-5">
                          <p className="text-sm text-slate-500">Total Pesanan</p>
                          <p className="mt-2 text-3xl font-bold">{adminPesanan.length}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-5">
                          <p className="text-sm text-slate-500">Menunggu Pembayaran</p>
                          <p className="mt-2 text-3xl font-bold text-amber-600">
                            {adminPesanan.filter((pesanan) => pesanan.status === 'menunggu_pembayaran').length}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-5">
                          <p className="text-sm text-slate-500">Menunggu Konfirmasi COD</p>
                          <p className="mt-2 text-3xl font-bold text-blue-600">
                            {adminPesanan.filter((pesanan) => pesanan.status === 'menunggu_konfirmasi').length}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-5">
                          <p className="text-sm text-slate-500">Pesanan Diproses</p>
                          <p className="mt-2 text-3xl font-bold text-purple-600">
                            {adminPesanan.filter((pesanan) => pesanan.status === 'diproses').length}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-5">
                          <p className="text-sm text-slate-500">Pesanan Selesai</p>
                          <p className="mt-2 text-3xl font-bold text-green-600">
                            {adminPesanan.filter((pesanan) => pesanan.status === 'selesai').length}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-5">
                          <p className="text-sm text-slate-500">Pesanan Dibatalkan</p>
                          <p className="mt-2 text-3xl font-bold text-red-600">
                            {adminPesanan.filter((pesanan) => pesanan.status === 'dibatalkan').length}
                          </p>
                        </div>
                      </div>
                    </section>
                  )}

                  {adminView === 'barang' && (
                    <section id="admin-barang" className="mt-5">
                      <h3 className="mb-4 text-xl font-bold">Kelola Barang</h3>
                      <div className="admin-product-grid">
                        {barang.length === 0 ? (
                          <p className="admin-product-empty">
                            Belum ada barang di katalog.
                          </p>
                        ) : (
                          barang.map((item) => (
                            <article key={item.id} className="admin-product-card">
                              <div className="admin-product-image">
                                {item.foto ? (
                                  <img src={item.foto} alt={item.nama} />
                                ) : (
                                  <span aria-hidden="true">📦</span>
                                )}
                              </div>
                              <div className="admin-product-details">
                                <h4 title={item.nama}>{item.nama}</h4>
                                <span className="admin-product-category">
                                  {item.kategori || 'Tanpa kategori'}
                                </span>
                                <strong className="admin-product-price">
                                  {formatRupiah(item.harga)}
                                </strong>
                                <span className="admin-product-stock">
                                  Stok: {item.stok} {item.satuan}
                                </span>
                              </div>
                              <div className="admin-product-actions">
                                <button
                                  type="button"
                                  className="admin-product-edit"
                                  onClick={() => {
                                    mulaiEditBarang(item);
                                    setAdminView('tambah');
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="admin-product-delete"
                                  onClick={() => hapusBarangAdmin(item)}
                                  disabled={adminLoading}
                                >
                                  Hapus
                                </button>
                              </div>
                            </article>
                          ))
                        )}
                      </div>
                    </section>
                  )}

                  {adminView === 'tambah' && (
                    <section
                      id="admin-tambah-barang"
                      className="admin-form-section"
                    >
                      <div className="admin-form-heading">
                        <div>
                          <h2>{barangEditId ? 'Edit Barang' : 'Tambah Barang'}</h2>
                          <p>
                            Lengkapi informasi produk untuk katalog Warung Nenek Yoyoh.
                          </p>
                        </div>
                        {barangEditId && (
                          <span className="admin-edit-badge">Mode Edit</span>
                        )}
                      </div>

                      <form
                        onSubmit={barangEditId ? simpanEditBarang : tambahBarang}
                        className="admin-form"
                      >
                        <div className="admin-form-grid">
                          <div className="admin-field">
                            <label htmlFor="barang-nama">Nama barang</label>
                            <input
                              id="barang-nama"
                              value={formBarang.nama}
                              onChange={(event) =>
                                setFormBarang({ ...formBarang, nama: event.target.value })
                              }
                              required
                              maxLength={100}
                              placeholder="Contoh: Minyak Goreng"
                            />
                          </div>

                          <div className="admin-field">
                            <label htmlFor="barang-kategori">Kategori</label>
                            <select
                              id="barang-kategori"
                              value={formBarang.kategori}
                              onChange={(event) => {
                                if (event.target.value === '__tambah_kategori__') {
                                  setTambahKategoriTerbuka(true);
                                  setKategoriBaruInput('');
                                  return;
                                }

                                setFormBarang({
                                  ...formBarang,
                                  kategori: event.target.value,
                                });
                              }}
                              required
                            >
                              <option value="">Pilih kategori</option>
                              {kategoriAdmin.map((kategori) => (
                                <option key={kategori} value={kategori}>
                                  {kategori}
                                </option>
                              ))}
                              <option value="__tambah_kategori__">
                                ＋ Tambah kategori baru
                              </option>
                            </select>

                            {tambahKategoriTerbuka && (
                              <div className="admin-category-create">
                                <input
                                  value={kategoriBaruInput}
                                  onChange={(event) =>
                                    setKategoriBaruInput(event.target.value)
                                  }
                                  placeholder="Nama kategori baru"
                                  maxLength={50}
                                  autoFocus
                                />
                                <button type="button" onClick={simpanKategoriBaru}>
                                  Simpan
                                </button>
                                <button
                                  type="button"
                                  className="admin-category-cancel"
                                  onClick={() => {
                                    setTambahKategoriTerbuka(false);
                                    setKategoriBaruInput('');
                                  }}
                                >
                                  Batal
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="admin-field">
                            <label htmlFor="barang-harga">Harga (Rp)</label>
                            <input
                              id="barang-harga"
                              type="number"
                              min="0"
                              step="1"
                              value={formBarang.harga}
                              onChange={(event) =>
                                setFormBarang({ ...formBarang, harga: event.target.value })
                              }
                              required
                              placeholder="Contoh: 15000"
                            />
                          </div>

                          <div className="admin-field">
                            <label htmlFor="barang-stok">Jumlah stok</label>
                            <input
                              id="barang-stok"
                              type="number"
                              min="0"
                              step="1"
                              value={formBarang.stok}
                              onChange={(event) =>
                                setFormBarang({ ...formBarang, stok: event.target.value })
                              }
                              required
                              placeholder="Contoh: 20"
                            />
                          </div>

                          <div className="admin-field">
                            <label htmlFor="barang-satuan">Satuan</label>
                            <select
                              id="barang-satuan"
                              value={formBarang.satuan}
                              onChange={(event) =>
                                setFormBarang({ ...formBarang, satuan: event.target.value })
                              }
                              required
                            >
                              <option value="">Pilih satuan</option>
                              <option value="pcs">Pcs</option>
                              <option value="kg">Kilogram (kg)</option>
                              <option value="liter">Liter</option>
                              <option value="bungkus">Bungkus</option>
                              <option value="pack">Pack</option>
                              <option value="botol">Botol</option>
                              <option value="karung">Karung</option>
                              <option value="dus">Dus</option>
                              <option value="ikat">Ikat</option>
                            </select>
                          </div>

                          <div className="admin-field admin-field-full">
                            <label htmlFor="barang-foto">Foto produk</label>
                            <div className="admin-photo-picker">
                              <div className="admin-photo-preview">
                                {formBarang.foto ? (
                                  <img src={formBarang.foto} alt="Preview produk" />
                                ) : (
                                  <div className="admin-photo-empty">
                                    <span>▧</span>
                                    <p>Preview foto produk</p>
                                  </div>
                                )}
                              </div>
                              <div className="admin-photo-controls">
                                <input
                                  id="barang-foto"
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  onChange={handleUploadFoto}
                                  disabled={fotoDiproses}
                                />
                                <p>
                                  JPG, PNG, atau WebP. Foto otomatis diperkecil agar
                                  proses penyimpanan lebih ringan.
                                </p>
                                {formBarang.foto && (
                                  <button
                                    type="button"
                                    className="admin-remove-photo"
                                    onClick={() =>
                                      setFormBarang({ ...formBarang, foto: '' })
                                    }
                                  >
                                    Hapus foto
                                  </button>
                                )}
                                {fotoDiproses && (
                                  <p className="admin-upload-status">
                                    Memproses foto...
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="admin-field admin-field-full">
                            <label htmlFor="barang-deskripsi">
                              Deskripsi <span>(opsional)</span>
                            </label>
                            <textarea
                              id="barang-deskripsi"
                              rows={4}
                              value={formBarang.deskripsi}
                              onChange={(event) =>
                                setFormBarang({
                                  ...formBarang,
                                  deskripsi: event.target.value,
                                })
                              }
                              placeholder="Tambahkan informasi produk jika diperlukan..."
                            />
                          </div>
                        </div>

                        {tambahBarangError && (
                          <p className="admin-form-error" role="alert">
                            {tambahBarangError}
                          </p>
                        )}
                        {tambahBarangPesan && (
                          <p className="admin-form-success" role="status">
                            {tambahBarangPesan}
                          </p>
                        )}

                        <div className="admin-form-actions">
                          {barangEditId && (
                            <button
                              type="button"
                              className="admin-form-secondary"
                              onClick={() => {
                                setBarangEditId(null);
                                setFormBarang({
                                  nama: '',
                                  kategori: '',
                                  harga: '',
                                  stok: '',
                                  satuan: 'pcs',
                                  foto: '',
                                  deskripsi: '',
                                });
                                setTambahBarangError('');
                                setTambahBarangPesan('');
                                setTambahKategoriTerbuka(false);
                              }}
                            >
                              Batal Edit
                            </button>
                          )}
                          <button
                            type="submit"
                            className="admin-form-primary"
                            disabled={tambahBarangLoading || fotoDiproses}
                          >
                            {fotoDiproses
                              ? 'Memproses foto...'
                              : tambahBarangLoading
                                ? 'Menyimpan...'
                                : barangEditId
                                  ? 'Simpan Perubahan'
                                  : 'Simpan Barang'}
                          </button>
                        </div>
                      </form>
                    </section>
                  )}

                  {adminView === 'pesanan' && (
                    <div id="admin-pesanan" className="mt-7">
                      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div>
                          <h3 className="text-xl font-bold">Daftar Pesanan</h3>
                          <p className="mt-1 text-sm text-slate-500">
                            Kelola dan perbarui status pesanan pelanggan.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => ambilPesananAdmin()}
                          disabled={adminLoading}
                          className="rounded-xl border border-purple-600 px-4 py-2 font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-50"
                        >
                          {adminLoading ? 'Memuat...' : 'Refresh Pesanan'}
                        </button>
                      </div>
                      {adminPesanan.length === 0 ? (
                        <p className="empty-message mt-3">Belum ada pesanan.</p>
                      ) : (
                        <div className="cart-list">
                          {adminPesanan.map((pesanan) => (
                        <article className="cart-summary" key={pesanan.id}>
                          <div className="flex flex-wrap justify-between gap-2">
                            <strong>{pesanan.kode_pesanan}</strong>
                            <span>{labelStatus(pesanan.status)}</span>
                          </div>
                          <p className="mt-2 text-sm">{pesanan.metode_pembayaran} · {formatRupiah(pesanan.total)}</p>
                          {(pesanan.items || []).map((item, index) => (
                            <p className="mt-1 text-sm" key={`${item.barang_id}-${index}`}>{item.nama_barang} × {item.jumlah}</p>
                          ))}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {pesanan.status === 'menunggu_konfirmasi' && pesanan.metode_pembayaran === 'COD' && (
                              <button
                                className="checkout-button"
                                disabled={adminLoading}
                                onClick={async () => {
                                  if (!window.confirm('Pastikan uang tunai sudah diterima. Konfirmasi pesanan ini?')) return;
                                  setAdminLoading(true);
                                  setAdminError('');
                                  try {
                                    const response = await fetch(`${API_PESANAN}/${encodeURIComponent(pesanan.kode_pesanan)}/konfirmasi-cod`, {
                                      method: 'POST',
                                      headers: { Authorization: `Bearer ${adminToken}` },
                                    });
                                    const data = await response.json();
                                    if (!response.ok) throw new Error(data.message || 'Konfirmasi COD gagal.');
                                    await ambilPesananAdmin();
                                  } catch (err) {
                                    setAdminError(err.message || 'Konfirmasi COD gagal.');
                                  } finally {
                                    setAdminLoading(false);
                                  }
                                }}
                              >
                                Konfirmasi Pembayaran COD
                              </button>
                            )}
                            {pesanan.status === 'diproses' && <button className="view-all-button" onClick={() => ubahStatusPesanan(pesanan, 'selesai')}>Selesaikan</button>}
                            {['menunggu_pembayaran', 'menunggu_konfirmasi'].includes(pesanan.status) && <button className="view-all-button" onClick={() => ubahStatusPesanan(pesanan, 'dibatalkan')}>Batalkan</button>}
                          </div>
                        </article>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      </main>

      <footer className="mt-12 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-sm text-slate-500 sm:px-6">
          © {new Date().getFullYear()} Warung Sembako Nenek Yoyoh
        </div>
      </footer>

      {/* ================= DETAIL PRODUK PELANGGAN ================= */}
      {barangDipilih && (
        <div
          className="customer-detail-overlay"
          onClick={() => setBarangDipilih(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="judul-detail"
            className="customer-detail-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="customer-detail-close"
              onClick={() => setBarangDipilih(null)}
              aria-label="Tutup detail produk"
            >
              ×
            </button>

            <div className="customer-detail-media">
              {barangDipilih.foto ? (
                <img
                  src={barangDipilih.foto}
                  alt={barangDipilih.nama}
                />
              ) : (
                <div className="customer-detail-placeholder">
                  <span aria-hidden="true">
                    {barangDipilih.kategori?.toLowerCase().includes('beras')
                      ? '🌾'
                      : barangDipilih.kategori?.toLowerCase().includes('minyak')
                        ? '🫒'
                        : barangDipilih.kategori?.toLowerCase().includes('mie')
                          ? '🍜'
                          : barangDipilih.kategori?.toLowerCase().includes('sembako')
                            ? '🧺'
                            : '🛍️'}
                  </span>
                  <p>Foto produk belum tersedia</p>
                </div>
              )}
              <span className="customer-detail-photo-label">DETAIL PRODUK</span>
            </div>

            <div className="customer-detail-content">
              <div className="customer-detail-topline">
                <span className="customer-detail-category">
                  {barangDipilih.kategori || 'Lainnya'}
                </span>
                <span
                  className={`customer-detail-stock-badge ${
                    Number(barangDipilih.stok) > 0
                      ? 'available'
                      : 'unavailable'
                  }`}
                >
                  <span className="customer-detail-stock-dot" />
                  {Number(barangDipilih.stok) > 0
                    ? 'Stok tersedia'
                    : 'Stok habis'}
                </span>
              </div>

              <h2 id="judul-detail" className="customer-detail-title">
                {barangDipilih.nama}
              </h2>

              <div className="customer-detail-price">
                <strong>{formatRupiah(barangDipilih.harga)}</strong>
                <span>/ {barangDipilih.satuan}</span>
              </div>

              <div className="customer-detail-divider" />

              <div className="customer-detail-inventory">
                <div className="customer-detail-inventory-icon">
                  <span aria-hidden="true">📦</span>
                </div>
                <div>
                  <p className="customer-detail-label">Ketersediaan barang</p>
                  <p
                    className={`customer-detail-inventory-value ${
                      Number(barangDipilih.stok) > 0
                        ? 'available'
                        : 'unavailable'
                    }`}
                  >
                    {Number(barangDipilih.stok) > 0
                      ? `${barangDipilih.stok} ${barangDipilih.satuan} tersedia`
                      : 'Maaf, barang sedang habis'}
                  </p>
                </div>
              </div>

              {barangDipilih.deskripsi?.trim() && (
                <div className="customer-detail-description">
                  <h3>Deskripsi produk</h3>
                  <p>{barangDipilih.deskripsi}</p>
                </div>
              )}

              <div className="customer-detail-footer">
                <p>Harga per {barangDipilih.satuan}</p>
                <button
                  type="button"
                  className="customer-detail-add-button"
                  onClick={() => tambahKeKeranjang(barangDipilih)}
                  disabled={Number(barangDipilih.stok) <= 0}
                >
                  <span aria-hidden="true">＋</span>
                  {Number(barangDipilih.stok) > 0
                    ? 'Tambahkan ke Keranjang'
                    : 'Stok Habis'}
                </button>
                <p className="customer-detail-note">
                  Periksa jumlah dan total belanja kembali di keranjang.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;