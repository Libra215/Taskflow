require('dotenv').config();

for (const k of ['SESSION_SECRET', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
  if (!process.env[k]) {
    console.error('Env wajib kosong: ' + k);
    process.exit(1);
  }
}

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const crypto = require('crypto');

const { pool } = require('./db');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.set('trust proxy', 1);


const cdn = 'https://cdn.jsdelivr.net';
const turnstile = 'https://challenges.cloudflare.com';

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),

            'style-src': [
                "'self'",
                cdn,
                "'unsafe-inline'"
            ],

            'script-src': [
                "'self'",
                cdn,
                turnstile
            ],

            'frame-src': [
                "'self'",
                turnstile
            ],

            'font-src': [
                "'self'",
                cdn
            ],

            'connect-src': [
                "'self'",
                turnstile
            ]
        }
    }
}));


app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.static(path.join(__dirname, '../public')));

// app.use(session({
//   name: 'tf.sid',
//   secret: process.env.SESSION_SECRET,
//   resave: false,
//   saveUninitialized: false,
//   store: new MySQLStore({ createDatabaseTable: true }, pool),
//   cookie: {
//     httpOnly: true,
//     sameSite: 'lax',
//     secure: process.env.NODE_ENV === 'production',
//     maxAge: 2 * 3600 * 1000
//   }
// }));


const sessionMiddleware = session({
  name: 'tf.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new MySQLStore({ createDatabaseTable: true }, pool),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 2 * 3600 * 1000
  }
});

app.use(sessionMiddleware);
app.set('sessionMiddleware', sessionMiddleware);


app.use((req, res, next) => {
  req.session.csrf = req.session.csrf || crypto.randomBytes(24).toString('hex');
  res.locals.csrf = req.session.csrf;
  res.locals.user = req.session.user || null;
  res.locals.appName = process.env.APP_NAME || 'TaskFlow';
  res.locals.flash = req.session.flash;
  res.locals.turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || '';
  delete req.session.flash;

  if (!['GET', 'HEAD'].includes(req.method)) {
    const t = (req.body && req.body._csrf) || req.query._csrf || '';
    const a = Buffer.from(String(t));
    const b = Buffer.from(req.session.csrf);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).render('error', { code: 403, msg: 'Token CSRF tidak valid' });
    }
  }
  next();
});

app.use(require('./routes'));

app.use((req, res) => res.status(404).render('error', { code: 404, msg: 'Halaman tidak ditemukan' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { code: 500, msg: 'Terjadi kesalahan pada server' });
});

module.exports = app;