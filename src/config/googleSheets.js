require('dotenv').config();

let sheetsClient = null;
let sheetsEnabled = process.env.GOOGLE_SHEETS_ENABLED === 'true';

const initSheets = async () => {
  if (!sheetsEnabled) return null;
  try {
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    sheetsClient = google.sheets({ version: 'v4', auth: authClient });
    console.log('✅ Google Sheets connected');
    return sheetsClient;
  } catch (err) {
    console.warn('⚠️  Google Sheets init failed:', err.message);
    sheetsEnabled = false;
    return null;
  }
};

const getClient = () => sheetsClient;
const isEnabled = () => sheetsEnabled;

module.exports = { initSheets, getClient, isEnabled };
