
require('dotenv').config();

const { sendWhatsApp } = require('./src/whatsapp');

async function main() {
    const phone = process.env.TEST_WA_PHONE;

    if (!phone) {
        throw new Error('TEST_WA_PHONE belum diisi di .env');
    }

    console.log('Mengirim pesan tes ke:', phone);

    const result = await sendWhatsApp(
        phone,
        'Tes notifikasi TaskFlow. Jika pesan ini masuk, integrasi WhatsApp berhasil.'
    );

    console.log('Provider:', result.provider);
    console.log('Message ID:', result.messageId || '-');
    console.log('Status Sidobe:', result.status);

    if (result.status === 'SUCCESS') {
        console.log('HASIL: Sidobe melaporkan pengiriman berhasil.');
    } else if (result.status === 'PENDING') {
        console.log('HASIL: Masih pending. Perlu cek status lanjutan.');
    } else {
        console.log('HASIL: Pengiriman gagal menurut Sidobe.');
    }
}

main().catch((error) => {
    console.error('TES GAGAL:', error.message);
    process.exitCode = 1;
});
