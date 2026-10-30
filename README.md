# TaskFlow (build awal)
Manajemen tugas untuk mahasiswa/siswa. Node.js + Express + EJS + MySQL.

## Instalasi lokal
1. `npm install --omit=dev`
2. Buat DB & user MySQL (hak minimum): `CREATE DATABASE taskflow CHARACTER SET utf8mb4; CREATE USER 'taskflow_app'@'127.0.0.1' IDENTIFIED BY '...'; GRANT ALL ON taskflow.* TO 'taskflow_app'@'127.0.0.1';`
3. `cp .env.example .env` lalu isi `SESSION_SECRET` (`openssl rand -hex 32`) dan password DB.
4. `npm run db:init` lalu `npm run admin:create`
5. `npm start` (listen 127.0.0.1:3100)

## Deployment Ubuntu 22.04 (ringkas)
- Pasang Node LTS, Nginx, MySQL; taruh kode di `/var/www/taskflow`; buat user `taskflow`: `sudo useradd -r -s /usr/sbin/nologin taskflow`; `chown -R taskflow: /var/www/taskflow/storage`; `chmod 600 .env`.
- systemd `/etc/systemd/system/taskflow.service`:
```
[Service]
User=taskflow
WorkingDirectory=/var/www/taskflow
ExecStart=/usr/bin/node src/server.js
Restart=always
[Install]
WantedBy=multi-user.target
```
`sudo systemctl enable --now taskflow`; log: `journalctl -u taskflow -f`
- Nginx server block baru (jangan ubah site lain): `server_name student.example.com; client_max_body_size 11m; location / { proxy_pass http://127.0.0.1:3100; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; }` lalu `sudo certbot --nginx -d student.example.com` (DNS harus sudah mengarah ke VPS).
- Backup: `mysqldump taskflow > backup.sql`; restore: `mysql taskflow < backup.sql`; backup juga `storage/uploads`.
- Update: `git pull && npm ci --omit=dev && sudo systemctl restart taskflow`.

## Belum tersedia di build ini
Kalender/agenda, riwayat, profil & ganti password, lupa password, pengaturan sistem admin, halaman pengingat fungsional (WhatsApp tetap Coming Soon), unit test, dokumentasi tabel lengkap, tampilan sidebar. Belum diuji pada MySQL/VPS nyata.
