exports.up = (pgm) => {
  pgm.addColumns('pesanan', {
    midtrans_transaction_id: {
      type: 'varchar(100)',
    },
    qr_code_url: {
      type: 'text',
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('pesanan', [
    'midtrans_transaction_id',
    'qr_code_url',
  ]);
};
