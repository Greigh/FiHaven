'use strict';

const { google } = require('googleapis');

const PACKAGE = process.env.GOOGLE_PLAY_PACKAGE || 'app.fihaven';
const KEY_FILE = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;

let publisherPromise;

function publisherClient() {
  if (!KEY_FILE) throw new Error('google-verify-not-configured');
  if (!publisherPromise) {
    const auth = new google.auth.GoogleAuth({
      keyFile: KEY_FILE,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    publisherPromise = auth.getClient().then((authClient) =>
      google.androidpublisher({ version: 'v3', auth: authClient })
    );
  }
  return publisherPromise;
}

/** Call Play Developer API subscriptionsv2.get for a purchase token. */
async function fetchSubscription(purchaseToken) {
  const publisher = await publisherClient();
  const { data } = await publisher.purchases.subscriptionsv2.get({
    packageName: PACKAGE,
    token: purchaseToken,
  });
  return data;
}

module.exports = { fetchSubscription, PACKAGE };
