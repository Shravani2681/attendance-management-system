require('dotenv').config();

// ─── Check-In Rules ────────────────────────────────────────────────────────────

/**
 * Determines salary type based on check-in time (IST)
 *  - Before 10:15 AM  → FULL day, no deduction
 *  - 10:15 AM – 1:00 PM → FULL day, ₹50 late deduction
 *  - After 1:00 PM    → HALF day
 */
const calculateSalaryType = (checkInTime) => {
  const date = new Date(checkInTime);
  const totalMinutes = date.getHours() * 60 + date.getMinutes();

  const lateCutoff = 10 * 60 + 15; // 10:15 AM
  const halfCutoff = 13 * 60;       // 1:00 PM

  if (totalMinutes < lateCutoff) return 'FULL';
  if (totalMinutes < halfCutoff) return 'FULL'; // FULL but late (₹50 deduction applied separately)
  return 'HALF';
};

/**
 * Late deduction: ₹50 if check-in is between 10:15 AM and 1:00 PM
 */
const calculateDeduction = (checkInTime) => {
  const date = new Date(checkInTime);
  const totalMinutes = date.getHours() * 60 + date.getMinutes();

  const lateCutoff = 10 * 60 + 15; // 10:15 AM
  const halfCutoff = 13 * 60;       // 1:00 PM

  return (totalMinutes >= lateCutoff && totalMinutes < halfCutoff) ? 50 : 0;
};

// ─── Check-Out Rules ───────────────────────────────────────────────────────────

/**
 * Determines salary type override based on check-out time (IST):
 *  - Before  2:00 PM → HALF (Early checkout)
 *  - After   2:00 PM → no change (keep existing salary type)
 */
const calculateCheckoutSalaryType = (checkOutTime) => {
  const date = new Date(checkOutTime);
  const totalMinutes = date.getHours() * 60 + date.getMinutes();

  const earlyHalfCutoff = 14 * 60; // 2:00 PM

  if (totalMinutes < earlyHalfCutoff) return 'HALF'; // force Half Day
  return null; // no salary_type override needed
};

/**
 * Checkout deduction based on check-out time (IST):
 *  - Before  2:00 PM  → HALF Day (no additional deduction amount; salary_type forced to HALF)
 *  - 2:00 PM – 3:00 PM  → ₹100 deduction
 *  - 3:00 PM – 4:30 PM  → ₹50 deduction
 *  - After   4:30 PM  → No deduction (Full salary)
 */
const calculateCheckoutDeduction = (checkOutTime) => {
  const date = new Date(checkOutTime);
  const totalMinutes = date.getHours() * 60 + date.getMinutes();

  const halfCutoff = 14 * 60;        // 2:00 PM  → HALF Day, no extra deduction
  const deduct100Cutoff = 15 * 60;        // 3:00 PM
  const deduct50Cutoff = 16 * 60 + 30;  // 4:30 PM
  // Note: "3:00 PM – 4:30 PM" 
  // means < 16:30

  if (totalMinutes < halfCutoff) return 0;   // HALF day – handled via salary_type
  if (totalMinutes < deduct100Cutoff) return 100; // 2:00–3:00 PM
  if (totalMinutes < deduct50Cutoff) return 50;  // 3:00–4:30 PM
  return 0;                                         // after 4:30 PM → full salary
};

/**
 * Human-readable reason for checkout deduction
 */
const calculateCheckoutDeductionReason = (checkOutTime) => {
  const date = new Date(checkOutTime);
  const totalMinutes = date.getHours() * 60 + date.getMinutes();

  if (totalMinutes < 14 * 60) return 'Early checkout before 2:00 PM — Half Day';
  if (totalMinutes < 15 * 60) return 'Early checkout (2:00–3:00 PM) — ₹100 deduction';
  if (totalMinutes < 16 * 60 + 30) return 'Early checkout (3:00–4:30 PM) — ₹50 deduction';
  return 'On-time checkout — Full salary';
};

// ─── Earned Amount & Monthly Summary ──────────────────────────────────────────

/**
 * Calculate earned salary for a single attendance record,
 * factoring in both check-in late deduction and checkout deduction.
 */
const calculateEarnedAmount = (monthlySalary, salaryType, deductionAmount = 0, checkoutDeductionAmount = 0) => {
  const daily = monthlySalary / 26; // 26 working days/month
  if (salaryType === 'FULL') {
    const totalDeduction = (deductionAmount || 0) + (checkoutDeductionAmount || 0);
    return Math.max(0, daily - totalDeduction);
  }
  if (salaryType === 'HALF') return daily / 2;
  return 0;
};

/**
 * Calculate salary summary for a date range.
 * Includes both check-in (late) deductions and checkout deductions.
 */
const calculateMonthlySummary = (records, monthlySalary) => {
  let fullDays = 0, halfDays = 0, absentDays = 0, totalDeductions = 0;
  let lateCount = 0, earlyCount = 0;
  
  records.forEach(r => {
    // If the record has the new explicit status column from our latest update, use it.
    // Otherwise fallback to deriving it from legacy deduction amounts.
    const isLate = r.status === 'Late Check-In' || r.status === 'Late' || (!r.status && (r.deduction_amount > 0));
    const isEarly = r.status === 'Early Check-Out' || (!r.status && (r.checkout_deduction_amount > 0));

    if (isLate) lateCount++;
    if (isEarly) earlyCount++;

    if (r.salary_type === 'FULL') {
      fullDays++;
      totalDeductions += (r.deduction_amount || 0) + (r.checkout_deduction_amount || 0);
    } else if (r.salary_type === 'HALF') {
      halfDays++;
      // A half day due to early checkout might also have a penalty
      totalDeductions += (r.deduction_amount || 0) + (r.checkout_deduction_amount || 0);
    } else {
      absentDays++;
    }
  });
  
  const dailyRate = monthlySalary / 26;
  const earned = (fullDays * dailyRate) + (halfDays * dailyRate * 0.5) - totalDeductions;
  return { 
    fullDays, halfDays, absentDays, totalDeductions, 
    lateCount, earlyCount,
    earned: Math.max(0, Math.round(earned * 100) / 100) 
  };
};

module.exports = {
  calculateSalaryType,
  calculateDeduction,
  calculateCheckoutSalaryType,
  calculateCheckoutDeduction,
  calculateCheckoutDeductionReason,
  calculateEarnedAmount,
  calculateMonthlySummary,
};
