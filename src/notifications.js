
'use strict';

const { q } = require('./db');
const { sendWhatsApp } = require('./whatsapp');

const TIME_ZONE = 'Asia/Jakarta';
const REMINDER_DAYS = [1, 3, 7];

let cycleRunning = false;

/**
 * Mengambil tanggal hari ini berdasarkan zona waktu Jakarta.
 * Hasil: YYYY-MM-DD
 */
function dateInJakarta(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);

    const values = Object.fromEntries(
        parts.map(part => [part.type, part.value])
    );

    return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Menghitung selisih hari kalender.
 */
function dateDiff(from, to) {
    const fromDate = String(from).slice(0, 10);
    const toDate = String(to).slice(0, 10);

    const a = Date.parse(`${fromDate}T00:00:00Z`);
    const b = Date.parse(`${toDate}T00:00:00Z`);

    return Math.round((b - a) / 86400000);
}

/**
 * Mengirim notifikasi kepada satu pengguna.
 *
 * Penerima diambil dari users.whatsapp.
 * Nomor pengirim ditangani oleh src/whatsapp.js melalui .env.
 *
 * Status:
 * - sent: Sidobe mengembalikan SUCCESS
 * - pending: menunggu konfirmasi atau hasil belum diketahui
 * - failed: pengiriman ditolak atau gagal
 */
async function notifyUser(userId, eventKey, message) {
    await q(
        `INSERT INTO notification_logs
            (event_key, user_id, channel, status)
         VALUES (?, ?, 'whatsapp', 'pending')
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [eventKey, userId]
    );

    const [log] = await q(
        `SELECT id, status, provider_message_id, provider_status
         FROM notification_logs
         WHERE event_key = ?
           AND user_id = ?
           AND channel = 'whatsapp'`,
        [eventKey, userId]
    );

    if (!log) {
        throw new Error('Log notifikasi tidak ditemukan');
    }

    // Notifikasi yang sudah terkirim tidak dikirim ulang.
    if (log.status === 'sent') {
        return {
            sent: true,
            skipped: true,
            status: 'SUCCESS'
        };
    }

    // Hindari pengiriman ulang jika status provider belum final.
    if (
        log.status === 'pending' &&
        ['PENDING', 'UNKNOWN'].includes(
            String(log.provider_status || '').toUpperCase()
        )
    ) {
        return {
            sent: false,
            pending: true,
            skipped: true,
            messageId: log.provider_message_id || null
        };
    }

    try {
        // Nomor penerima selalu diambil dari tabel users.
        const [user] = await q(
            `SELECT name, whatsapp, is_active
             FROM users
             WHERE id = ?`,
            [userId]
        );

        if (!user || !user.is_active) {
            throw new Error('Pengguna tidak ditemukan atau tidak aktif');
        }

        if (!user.whatsapp) {
            throw new Error('Nomor WhatsApp belum diisi pada profil');
        }

        // Nomor pengirim dikonfigurasi melalui .env di src/whatsapp.js.
        const result = await sendWhatsApp(
            user.whatsapp,
            message
        );

        if (result.status === 'SUCCESS') {
            await q(
                `UPDATE notification_logs
                 SET status = 'sent',
                     sent_at = NOW(),
                     provider_message_id = ?,
                     provider_status = 'SUCCESS',
                     error_message = NULL
                 WHERE id = ?`,
                [result.messageId, log.id]
            );

            console.log(
                `[WhatsApp] Berhasil: user=${userId}, event=${eventKey}, ` +
                `messageId=${result.messageId || '-'}`
            );

            return {
                sent: true,
                status: 'SUCCESS',
                messageId: result.messageId
            };
        }

        if (result.status === 'PENDING') {
            await q(
                `UPDATE notification_logs
                 SET status = 'pending',
                     provider_message_id = ?,
                     provider_status = 'PENDING',
                     error_message = ?
                 WHERE id = ?`,
                [
                    result.messageId,
                    'Menunggu konfirmasi status dari Sidobe',
                    log.id
                ]
            );

            console.log(
                `[WhatsApp] Menunggu konfirmasi: user=${userId}, ` +
                `messageId=${result.messageId || '-'}`
            );

            return {
                sent: false,
                pending: true,
                status: 'PENDING',
                messageId: result.messageId
            };
        }

        // Sidobe menyatakan pengiriman gagal.
        await q(
            `UPDATE notification_logs
             SET status = 'failed',
                 provider_message_id = ?,
                 provider_status = 'FAILED',
                 error_message = ?
             WHERE id = ?`,
            [
                result.messageId,
                'Sidobe melaporkan pengiriman gagal',
                log.id
            ]
        );

        console.error(
            `[WhatsApp] Gagal: user=${userId}, event=${eventKey}`
        );

        return {
            sent: false,
            status: 'FAILED'
        };
    } catch (error) {
        const uncertain = error.uncertain === true;

        // Jika timeout atau koneksi terputus, pesan mungkin sudah terkirim.
        // Simpan UNKNOWN agar tidak otomatis mengirim pesan yang sama lagi.
        await q(
            `UPDATE notification_logs
             SET status = ?,
                 provider_status = ?,
                 error_message = ?
             WHERE id = ?`,
            [
                uncertain ? 'pending' : 'failed',
                uncertain ? 'UNKNOWN' : 'FAILED',
                String(error.message || 'Pengiriman gagal').slice(0, 255),
                log.id
            ]
        );

        console.error(
            `[WhatsApp] Notifikasi user ${userId}:`,
            error.message
        );

        return {
            sent: false,
            pending: uncertain,
            error: error.message
        };
    }
}

/**
 * Memasukkan notifikasi ke proses async agar respons halaman
 * tidak perlu menunggu API WhatsApp selesai.
 */
function queueNotification(userId, eventKey, message) {
    setImmediate(() => {
        notifyUser(userId, eventKey, message).catch(error => {
            console.error(
                '[WhatsApp] Notifikasi gagal diproses:',
                error.message
            );
        });
    });
}

/**
 * Mengirim pengingat deadline tugas pribadi.
 */
async function sendPersonalDeadlineReminder(task, daysBefore) {
    const eventKey = `deadline:personal:${task.id}:${daysBefore}`;

    const deadline = String(task.deadline)
        .replace('T', ' ')
        .slice(0, 16);

    const message =
        `⏰ *Pengingat Deadline TaskFlow*\n\n` +
        `Halo ${task.name || 'Pengguna'},\n` +
        `deadline tugas kamu tinggal ${daysBefore} hari lagi.\n\n` +
        `📌 Tugas: ${task.title}\n` +
        `📅 Deadline: ${deadline}\n` +
        `📊 Status: ${task.status}\n\n` +
        `Silakan selesaikan tugas sebelum tenggat waktu.`;

    return notifyUser(task.user_id, eventKey, message);
}

/**
 * Mengirim pengingat deadline tugas kelompok.
 */
async function sendGroupDeadlineReminder(task, daysBefore) {
    const eventKey =
        `deadline:group:${task.id}:${task.user_id}:${daysBefore}`;

    const deadline = String(task.deadline)
        .replace('T', ' ')
        .slice(0, 16);

    const message =
        `⏰ *Pengingat Deadline Tugas Kelompok*\n\n` +
        `Halo ${task.name || 'Pengguna'},\n` +
        `deadline tugas kelompok tinggal ${daysBefore} hari lagi.\n\n` +
        `👥 Kelompok: ${task.group_name}\n` +
        `📌 Tugas: ${task.title}\n` +
        `📅 Deadline: ${deadline}\n\n` +
        `Buka TaskFlow untuk melihat detail tugas.`;

    return notifyUser(task.user_id, eventKey, message);
}

/**
 * Peringatan tugas yang sudah melewati deadline.
 * Event key berisi tanggal sehingga peringatan dibuat sekali per hari.
 */
async function sendOverdue(
    userId,
    eventKey,
    title,
    deadline,
    kind = 'Tugas'
) {
    const due = String(deadline || '')
        .replace('T', ' ')
        .slice(0, 16);

    const message =
        `⚠️ *Peringatan Tugas Terlambat — TaskFlow*\n\n` +
        `${kind}: ${title}\n` +
        `📅 Deadline: ${due}\n\n` +
        `Tugas ini belum ditandai selesai. Silakan buka TaskFlow ` +
        `untuk memperbarui statusnya.`;

    return notifyUser(userId, eventKey, message);
}

/**
 * Membaca preferensi pengingat pengguna.
 * Jika belum ada data preferensi, H-1, H-3, dan H-7 aktif secara default.
 */
async function reminderEnabled(userId, daysBefore) {
    const [preference] = await q(
        `SELECT enabled
         FROM reminder_preferences
         WHERE user_id = ? AND days_before = ?`,
        [userId, daysBefore]
    );

    return !preference || Number(preference.enabled) === 1;
}

/**
 * Memproses pengingat deadline dan tugas terlambat.
 */
async function runNotificationCycle() {
    if (cycleRunning) return;

    cycleRunning = true;

    try {
        const today = dateInJakarta();

        // 1. Tugas pribadi.
        const personalTasks = await q(
            `SELECT
                t.id,
                t.user_id,
                t.title,
                t.deadline,
                t.status,
                u.name
             FROM tasks t
             JOIN users u ON u.id = t.user_id
             WHERE t.status <> 'selesai'
               AND DATE(t.deadline) <= DATE_ADD(?, INTERVAL 7 DAY)`,
            [today]
        );

        for (const task of personalTasks) {
            const daysLeft = dateDiff(today, task.deadline);

            if (REMINDER_DAYS.includes(daysLeft)) {
                if (await reminderEnabled(task.user_id, daysLeft)) {
                    await sendPersonalDeadlineReminder(task, daysLeft);
                }
            }

            if (daysLeft < 0) {
                await sendOverdue(
                    task.user_id,
                    `overdue:personal:${task.id}:${today}`,
                    task.title,
                    task.deadline,
                    'Tugas pribadi'
                );
            }
        }

        // 2. Tugas kelompok.
        // Jika ditugaskan kepada anggota tertentu, hanya anggota tersebut
        // yang menerima pengingat. Jika tidak, semua anggota kelompok menerima.
        const groupTasks = await q(
            `SELECT
                gt.id,
                gt.group_id,
                gt.assigned_to,
                gt.title,
                gt.deadline,
                gt.status,
                g.name AS group_name,
                gm.user_id,
                u.name
             FROM group_tasks gt
             JOIN task_groups g ON g.id = gt.group_id
             JOIN task_group_members gm ON gm.group_id = gt.group_id
             JOIN users u ON u.id = gm.user_id
             WHERE gt.status <> 'selesai'
               AND gt.deadline IS NOT NULL
               AND DATE(gt.deadline) <= DATE_ADD(?, INTERVAL 7 DAY)
               AND (
                    gt.assigned_to IS NULL
                    OR gt.assigned_to = gm.user_id
               )`,
            [today]
        );

        for (const task of groupTasks) {
            const daysLeft = dateDiff(today, task.deadline);

            if (REMINDER_DAYS.includes(daysLeft)) {
                if (await reminderEnabled(task.user_id, daysLeft)) {
                    await sendGroupDeadlineReminder(task, daysLeft);
                }
            }

            if (daysLeft < 0) {
                await sendOverdue(
                    task.user_id,
                    `overdue:group:${task.id}:${task.user_id}:${today}`,
                    task.title,
                    task.deadline,
                    `Tugas kelompok (${task.group_name})`
                );
            }
        }
    } catch (error) {
        console.error(
            '[WhatsApp] Siklus notifikasi gagal:',
            error.message
        );
    } finally {
        cycleRunning = false;
    }
}

/**
 * Memberi notifikasi kepada anggota kelompok.
 * Pengguna yang memicu event dapat dikecualikan jika diperlukan.
 */
async function notifyGroupMembers(
    groupId,
    eventKey,
    message,
    { excludeUserId = null } = {}
) {
    const members = await q(
        `SELECT gm.user_id
         FROM task_group_members gm
         JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = ?
           AND u.is_active = 1`,
        [groupId]
    );

    const recipients = members.filter(member =>
        excludeUserId === null ||
        Number(member.user_id) !== Number(excludeUserId)
    );

    const results = await Promise.all(
        recipients.map(member =>
            notifyUser(member.user_id, eventKey, message)
        )
    );

    return results;
}

/**
 * Menjalankan scheduler saat server mulai.
 * Pemeriksaan dilakukan segera setelah startup dan setiap 15 menit.
 */
function startNotificationScheduler() {
    if (process.env.WA_NOTIFICATIONS_ENABLED === 'false') {
        console.log(
            '[WhatsApp] Scheduler dinonaktifkan melalui konfigurasi .env'
        );
        return;
    }

    setTimeout(() => {
        runNotificationCycle().catch(error => {
            console.error('[WhatsApp] Scheduler gagal:', error.message);
        });
    }, 5000);

    setInterval(() => {
        runNotificationCycle().catch(error => {
            console.error('[WhatsApp] Scheduler gagal:', error.message);
        });
    }, 10 * 60 * 1000);

    console.log(
        '[WhatsApp] Scheduler aktif: pemeriksaan setiap 10 menit'
    );
}

module.exports = {
    queueNotification,
    notifyUser,
    notifyGroupMembers,
    startNotificationScheduler,
    runNotificationCycle
};
