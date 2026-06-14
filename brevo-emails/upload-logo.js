/**
 * Kereke Hub - Logo Upload to Firebase Storage
 * Run this ONCE to host the logo and get a public URL for Brevo emails.
 *
 * How to run (from the Kerehub.co.za project folder):
 *   node brevo-emails/upload-logo.js
 *
 * It will print the public logo URL at the end.
 * Paste that URL into each HTML email file where it says LOGO_URL_HERE.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load service account from the project root
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: `${serviceAccount.project_id}.appspot.com`,
});

const bucket = admin.storage().bucket();

async function uploadLogo() {
  const localPath = path.join(__dirname, '..', 'Kereke_logo.png');

  if (!fs.existsSync(localPath)) {
    console.error('ERROR: Kereke_logo.png not found at', localPath);
    process.exit(1);
  }

  const destination = 'brand/kereke-logo.png';

  console.log('Uploading logo to Firebase Storage...');

  await bucket.upload(localPath, {
    destination,
    metadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000',
    },
  });

  // Make the file publicly readable
  await bucket.file(destination).makePublic();

  const publicUrl = `https://storage.googleapis.com/${serviceAccount.project_id}.appspot.com/${destination}`;

  console.log('\n=== SUCCESS ===');
  console.log('Logo is now live at:');
  console.log(publicUrl);
  console.log('\nPaste this URL into each HTML email file where you see LOGO_URL_HERE');
}

uploadLogo().catch((err) => {
  console.error('Upload failed:', err.message);
  process.exit(1);
});
