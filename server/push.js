/* ═══════════════════════════════════════════════════════════
   push.js — server-initiated remote notifications (APNs / FCM).
   Env-gated: when credentials are unset, sendToUser is a no-op.
   Invalid/expired tokens are pruned from push_devices on send failure.
═════════════════════════════════════════════════════════════════ */

'use strict';

const fs = require('fs');
const db = require('./db');

let apnsClient = null;
let fcmReady = false;
let webPush = null;
let webPushReady = false;

function money(amount, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(Number(amount) || 0);
}

function leadPhrase(days) {
  const d = parseInt(days, 10) || 0;
  if (d <= 0) return 'due today';
  if (d === 1) return 'due tomorrow';
  return `due in ${d} days`;
}

function resolvePath(envPath, fallbackEnv) {
  if (envPath && fs.existsSync(envPath)) return envPath;
  const alt = process.env[fallbackEnv];
  if (alt && fs.existsSync(alt)) return alt;
  return null;
}

function init() {
  const apnsKeyPath = resolvePath(process.env.APNS_KEY_PATH, 'APNS_SA_LOCAL');
  if (process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && apnsKeyPath) {
    try {
      const { ApnsClient } = require('apns2');
      apnsClient = new ApnsClient({
        team: process.env.APNS_TEAM_ID,
        keyId: process.env.APNS_KEY_ID,
        signingKey: fs.readFileSync(apnsKeyPath),
        defaultTopic: process.env.APNS_BUNDLE_ID || 'app.fihaven',
        host: process.env.APNS_PRODUCTION === '1'
          ? 'api.push.apple.com'
          : 'api.sandbox.push.apple.com',
      });
    } catch (e) {
      console.error('APNs init failed', e && e.message);
      apnsClient = null;
    }
  }

  const fcmPath = resolvePath(process.env.FCM_SERVICE_ACCOUNT_JSON, 'FCM_SA_LOCAL');
  if (fcmPath) {
    try {
      const admin = require('firebase-admin');
      if (!admin.getApps().length) {
        admin.initializeApp({
          credential: admin.cert(JSON.parse(fs.readFileSync(fcmPath, 'utf8'))),
        });
      }
      fcmReady = true;
    } catch (e) {
      console.error('FCM init failed', e && e.message);
      fcmReady = false;
    }
  }

  // Web Push (browser notifications) via VAPID. The public key is also served
  // to the client (see routes/push.js /config) so it can subscribe.
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    try {
      webPush = require('web-push');
      webPush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:support@fihaven.app',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY,
      );
      webPushReady = true;
    } catch (e) {
      console.error('Web push init failed', e && e.message);
      webPushReady = false;
    }
  }
}

function configured() {
  return !!(apnsClient || fcmReady || webPushReady);
}

function vapidPublicKey() {
  return webPushReady ? (process.env.VAPID_PUBLIC_KEY || null) : null;
}

async function sendApns(token, { title, body }) {
  const { Notification } = require('apns2');
  await apnsClient.send(new Notification(token, {
    aps: {
      alert: { title, body },
      sound: 'default',
    },
  }));
}

async function sendFcm(token, { title, body }) {
  const admin = require('firebase-admin');
  await admin.messaging().send({
    token,
    notification: { title, body },
  });
}

// Web Push (VAPID). The stored token is the JSON PushSubscription the browser
// handed us at subscribe time; the service worker renders {title, body}.
async function sendWeb(token, { title, body }) {
  await webPush.sendNotification(JSON.parse(token), JSON.stringify({ title, body }));
}

function isStaleTokenError(err) {
  // Web Push: 404/410 mean the browser subscription is gone — drop it.
  if (err && (err.statusCode === 404 || err.statusCode === 410)) return true;
  const msg = String((err && err.message) || err || '').toLowerCase();
  const code = err && (err.code || err.reason);
  if (code === 'BadDeviceToken' || code === 'Unregistered') return true;
  if (code === 'messaging/registration-token-not-registered') return true;
  if (code === 'messaging/invalid-registration-token') return true;
  return msg.includes('baddevicetoken')
    || msg.includes('unregistered')
    || msg.includes('registration-token-not-registered')
    || msg.includes('invalid-registration-token');
}

async function sendToUser(userId, payload) {
  if (!configured()) return { sent: 0, skipped: 'unconfigured' };
  const devices = db.listPushDevices(userId);
  if (!devices.length) return { sent: 0, skipped: 'no-devices' };

  let sent = 0;
  for (const { platform, token } of devices) {
    try {
      if (platform === 'ios' && apnsClient) {
        await sendApns(token, payload);
        sent += 1;
      } else if (platform === 'android' && fcmReady) {
        await sendFcm(token, payload);
        sent += 1;
      } else if (platform === 'web' && webPushReady) {
        await sendWeb(token, payload);
        sent += 1;
      }
    } catch (e) {
      if (isStaleTokenError(e)) db.deletePushDeviceByToken(token);
      else console.error('push send failed', userId, platform, e && e.message);
    }
  }
  return { sent };
}

async function sendBillReminderPush(userId, bills, leadDays, currency) {
  const n = bills.length;
  const phrase = leadPhrase(leadDays);
  const title = n === 1 ? 'Bill reminder' : `${n} bills ${phrase}`;
  const first = bills[0];
  const body = n === 1
    ? `${first.name || 'Bill'} — ${money(first.amount, currency)} (${phrase})`
    : bills.slice(0, 3).map((b) => b.name || 'Bill').join(', ')
      + (n > 3 ? ` +${n - 3} more` : '');
  return sendToUser(userId, { title, body });
}

async function sendTrialReminderPush(userId, bills, leadDays) {
  const n = bills.length;
  const phrase = leadPhrase(leadDays);
  const title = n === 1 ? 'Trial ending soon' : `${n} trials ${phrase}`;
  const body = n === 1
    ? `${bills[0].name || 'Subscription'} free trial ${phrase}`
    : bills.slice(0, 3).map((b) => b.name || 'Subscription').join(', ');
  return sendToUser(userId, { title, body });
}

async function sendOfferReminderPush(userId, offers, leadDays) {
  const n = offers.length;
  const phrase = leadPhrase(leadDays);
  const title = n === 1 ? 'Offer expiring' : `${n} offers ${phrase}`;
  const body = n === 1
    ? `${offers[0].merchant || 'Offer'} on ${offers[0].cardName || 'card'} ${phrase}`
    : offers.slice(0, 2).map((o) => o.merchant || 'Offer').join(', ');
  return sendToUser(userId, { title, body });
}

async function sendWeeklyDigestPush(userId, digest, currency) {
  const upcoming = Array.isArray(digest.upcoming) ? digest.upcoming : [];
  const title = 'Weekly digest';
  const body = upcoming.length
    ? `${upcoming.length} bill${upcoming.length === 1 ? '' : 's'} due this week · ${money(digest.upcomingTotal, currency)}`
    : `No bills due this week · debt ${money(digest.debtTotal, currency)}`;
  return sendToUser(userId, { title, body });
}

async function sendMonthlySummaryPush(userId, summary, currency) {
  const title = `Summary — ${summary.month}`;
  const body = `Paid ${money(summary.paid, currency)} · ${summary.billsCount} bills · debt ${money(summary.debtTotal, currency)}`;
  return sendToUser(userId, { title, body });
}

init();

module.exports = {
  configured,
  vapidPublicKey,
  sendToUser,
  sendBillReminderPush,
  sendTrialReminderPush,
  sendOfferReminderPush,
  sendWeeklyDigestPush,
  sendMonthlySummaryPush,
};
