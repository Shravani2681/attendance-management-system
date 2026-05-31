const { getClient, isEnabled } = require('../config/googleSheets');

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME = 'Attendance';

const HEADERS = [
  'Row', 'Employee ID', 'Employee Name', 'Department', 'Email',
  'Date', 'Check-In Time', 'Check-Out Time', 'GPS Status', 'GPS Distance (m)',
  'Salary Type', 'Monthly Salary', 'Earned Amount', 'Is Edited', 'Notes'
];

/**
 * Ensure the header row exists
 */
const ensureHeaders = async () => {
  if (!isEnabled()) return;
  try {
    const sheets = getClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:O1`,
    });
    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
    }
  } catch (err) {
    console.warn('Sheets ensureHeaders error:', err.message);
  }
};

/**
 * Append a new attendance row to Google Sheets
 * Returns the row number written
 */
const appendRow = async (record) => {
  if (!isEnabled()) return null;
  try {
    await ensureHeaders();
    const sheets = getClient();
    const row = [
      '', record.employee_id, record.employee_name, record.department,
      record.email, record.date, record.check_in_time, record.check_out_time || '',
      record.gps_status, record.gps_distance || '',
      record.salary_type, record.monthly_salary, record.earned_amount,
      record.is_edited ? 'YES' : 'NO', record.notes || ''
    ];
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:O`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    const updatedRange = res.data.updates.updatedRange;
    const rowNumber = parseInt(updatedRange.match(/\d+/g).pop());
    // Write row number into col A
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[rowNumber]] },
    });
    return rowNumber;
  } catch (err) {
    console.warn('Sheets appendRow error:', err.message);
    return null;
  }
};

/**
 * Update an existing row in Google Sheets
 */
const updateRow = async (rowNumber, record) => {
  if (!isEnabled() || !rowNumber) return;
  try {
    const sheets = getClient();
    const row = [
      rowNumber, record.employee_id, record.employee_name, record.department,
      record.email, record.date, record.check_in_time, record.check_out_time || '',
      record.gps_status, record.gps_distance || '',
      record.salary_type, record.monthly_salary, record.earned_amount,
      record.is_edited ? 'YES' : 'NO', record.notes || ''
    ];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${rowNumber}:O${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });
  } catch (err) {
    console.warn('Sheets updateRow error:', err.message);
  }
};

module.exports = { appendRow, updateRow };
