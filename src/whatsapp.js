
'use strict';

const API_URL =
    process.env.WHATSAPP_API_URL ||
    'https://api.sidobe.com/wa/v1/send-message';

const SECRET_KEY = process.env.WHATSAPP_SECRET_KEY;
const SENDER_PHONE = process.env.WHATSAPP_SENDER_PHONE;
const TIMEOUT_MS = Number(process.env.WHATSAPP_TIMEOUT_MS || 15000);

function normalizePhone(value) {
    if (value === undefined || value === null || value === '') {
        throw new Error('Nomor WhatsApp belum diisi');
    }

    let phone = String(value).trim().replace(/[\s()-]/g, '');

    if (phone.startsWith('08')) {
        phone = '+62' + phone.slice(1);
    } else if (phone.startsWith('62')) {
        phone = '+' + phone;
    } else if (phone.startsWith('8')) {
        phone = '+62' + phone;
    }

    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
        throw new Error('Format nomor WhatsApp tidak valid');
    }

    return phone;
}

async function sendWhatsApp(phone, message) {
    if (!SECRET_KEY) {
        throw new Error('WHATSAPP_SECRET_KEY belum dikonfigurasi');
    }

    if (!SENDER_PHONE) {
        throw new Error('WHATSAPP_SENDER_PHONE belum dikonfigurasi');
    }

    if (!message || !String(message).trim()) {
        throw new Error('Pesan WhatsApp tidak boleh kosong');
    }

    const payload = {
    phone: normalizePhone(phone),
    message: String(message),
    is_async: false
    };

    let response;

    try {
        response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'X-Secret-Key': SECRET_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
    } catch (err) {
        const error = new Error(
            'Koneksi ke Sidobe gagal atau timeout; status pengiriman belum pasti'
        );

        error.code = 'WHATSAPP_NETWORK';
        error.uncertain = true;
        throw error;
    }

    const rawBody = await response.text();
    let result;

    try {
        result = JSON.parse(rawBody);
    } catch {
        const error = new Error(
            `Respons Sidobe bukan JSON (HTTP ${response.status})`
        );

        error.code = 'WHATSAPP_INVALID_RESPONSE';
        error.uncertain = response.ok;
        throw error;
    }

    
    if (!response.ok || result.is_success !== true) {
        console.error('Sidobe HTTP:', response.status);
        console.error('Sidobe error code:', result.error_code || '-');
        console.error('Sidobe message:', result.message || '-');
    
        const error = new Error(
            `Sidobe menolak permintaan (HTTP ${response.status}): ` +
            (result.message || result.error_code || 'Alasan tidak tersedia')
        );
    
        error.code = result.error_code || 'WHATSAPP_API_ERROR';
        throw error;
    }
    

    const data = result.data || {};
    const status = String(data.status || 'PENDING').toUpperCase();

    if (!['SUCCESS', 'FAILED', 'PENDING'].includes(status)) {
        const error = new Error('Status pengiriman Sidobe tidak dikenal');
        error.code = 'WHATSAPP_UNKNOWN_STATUS';
        error.uncertain = true;
        throw error;
    }

    return {
        provider: 'sidobe',
        messageId: data.id ? String(data.id) : null,
        status,
        isAsync: data.is_async ?? false
    };
}

module.exports = {
    sendWhatsApp,
    normalizePhone
};
