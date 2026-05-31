import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { KeyRound, Mail, ShieldCheck, ArrowLeft, Eye, EyeOff, CheckCircle, AlertCircle, Loader, RefreshCw } from 'lucide-react';

const maskEmail = (email) => {
  const [user, domain] = email.split('@');
  const visible = user.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(user.length - 2, 3))}@${domain}`;
};

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [userName, setUserName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef([]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const otp = otpDigits.join('');

  // ── OTP digit input handlers ──────────────────────────────────────────────
  const handleDigitChange = (index, val) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleDigitKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0)
      inputRefs.current[index - 1]?.focus();
  };

  const handleDigitPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = ['', '', '', '', '', ''];
    pasted.split('').forEach((d, i) => { next[i] = d; });
    setOtpDigits(next);
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  // ── Step 1: Send OTP ──────────────────────────────────────────────────────
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSuccess(`OTP sent! Check your inbox at ${maskEmail(email)}`);
      setStep(2);
      setCountdown(60);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (countdown > 0) return;
    setError(''); setSuccess('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setOtpDigits(['', '', '', '', '', '']);
      setSuccess('New OTP sent! Check your inbox.');
      setCountdown(60);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend OTP.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { setError('Please enter the complete 6-digit OTP.'); return; }
    setError(''); setSuccess('');
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { email, otp });
      setResetToken(res.data.reset_token);
      setUserName(res.data.user_name);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Reset Password ────────────────────────────────────────────────
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { reset_token: resetToken, new_password: newPassword });
      setStep(4);
    } catch (err) {
      setError(err.response?.data?.message || 'Password reset failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const errorBox = (msg) => msg ? (
    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.7rem 1rem', borderRadius:'8px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', marginBottom:'1rem' }}>
      <AlertCircle size={16} color="#ef4444" />
      <span style={{ color:'#ef4444', fontSize:'0.85rem', fontWeight:500 }}>{msg}</span>
    </div>
  ) : null;

  const successBox = (msg) => msg ? (
    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.7rem 1rem', borderRadius:'8px', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.2)', marginBottom:'1rem' }}>
      <CheckCircle size={16} color="#10b981" />
      <span style={{ color:'#10b981', fontSize:'0.85rem', fontWeight:500 }}>{msg}</span>
    </div>
  ) : null;

  // ── Step progress indicator ───────────────────────────────────────────────
  const StepDots = () => (
    <div style={{ display:'flex', justifyContent:'center', gap:'0.5rem', marginBottom:'1.5rem' }}>
      {[1,2,3,4].map(s => (
        <div key={s} style={{
          width: s === step ? '24px' : '8px', height:'8px',
          borderRadius:'4px', transition:'all 0.3s ease',
          background: s < step ? '#10b981' : s === step ? '#818cf8' : 'rgba(255,255,255,0.15)'
        }} />
      ))}
    </div>
  );

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="glass-card">
          <StepDots />

          {/* ── Step 1: Enter Email ── */}
          {step === 1 && (
            <>
              <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
                <div style={{ width:'64px', height:'64px', borderRadius:'50%', background:'rgba(79,70,229,0.15)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1rem' }}>
                  <KeyRound size={28} color="#818cf8" />
                </div>
                <h1 className="auth-title">Forgot Password?</h1>
                <p className="auth-subtitle" style={{ marginBottom:0 }}>Enter your registered email — we'll send you an OTP</p>
              </div>

              <form onSubmit={handleSendOtp}>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <div style={{ position:'relative' }}>
                    <Mail size={16} style={{ position:'absolute', left:'0.85rem', top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }} />
                    <input type="email" className="form-input" style={{ paddingLeft:'2.5rem' }}
                      value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="Enter your registered email" required autoFocus />
                  </div>
                </div>

                {errorBox(error)}

                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <><Loader size={16} style={{ animation:'spin 1s linear infinite' }} /> Sending OTP...</> : <><Mail size={18} /> Send OTP</>}
                </button>
              </form>

              <div className="text-center mt-4" style={{ fontSize:'0.9rem', color:'var(--text-muted)' }}>
                <Link to="/login" className="link" style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem' }}>
                  <ArrowLeft size={14} /> Back to Login
                </Link>
              </div>
            </>
          )}

          {/* ── Step 2: Enter OTP ── */}
          {step === 2 && (
            <>
              <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
                <div style={{ width:'64px', height:'64px', borderRadius:'50%', background:'rgba(79,70,229,0.15)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1rem' }}>
                  <ShieldCheck size={28} color="#818cf8" />
                </div>
                <h1 className="auth-title">Enter OTP</h1>
                <p className="auth-subtitle" style={{ marginBottom:0 }}>
                  We sent a 6-digit code to <strong style={{ WebkitTextFillColor:'#818cf8' }}>{maskEmail(email)}</strong>
                </p>
              </div>

              {successBox(success)}

              <form onSubmit={handleVerifyOtp}>
                {/* 6-digit OTP boxes */}
                <div style={{ display:'flex', gap:'0.5rem', justifyContent:'center', marginBottom:'1.5rem' }}>
                  {otpDigits.map((d, i) => (
                    <input key={i}
                      ref={el => inputRefs.current[i] = el}
                      type="text" inputMode="numeric" maxLength={1}
                      value={d}
                      onChange={e => handleDigitChange(i, e.target.value)}
                      onKeyDown={e => handleDigitKeyDown(i, e)}
                      onPaste={i === 0 ? handleDigitPaste : undefined}
                      style={{
                        width:'48px', height:'56px', textAlign:'center',
                        fontSize:'1.5rem', fontWeight:'700', fontFamily:"'Courier New', monospace",
                        background:'rgba(255,255,255,0.05)', border:`2px solid ${d ? '#818cf8' : 'var(--border)'}`,
                        borderRadius:'10px', color:'#e2e8f0', outline:'none',
                        transition:'border-color 0.2s',
                        caretColor:'#818cf8'
                      }}
                    />
                  ))}
                </div>

                {errorBox(error)}

                <button type="submit" className="btn btn-primary" disabled={loading || otp.length !== 6}>
                  {loading ? <><Loader size={16} style={{ animation:'spin 1s linear infinite' }} /> Verifying...</> : <><ShieldCheck size={18} /> Verify OTP</>}
                </button>
              </form>

              {/* Resend */}
              <div style={{ textAlign:'center', marginTop:'1.2rem', fontSize:'0.88rem', color:'var(--text-muted)' }}>
                {countdown > 0 ? (
                  <span>Resend OTP in <strong style={{ color:'#818cf8' }}>{countdown}s</strong></span>
                ) : (
                  <button onClick={handleResend} disabled={loading}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#818cf8', fontWeight:600, fontSize:'0.88rem', display:'inline-flex', alignItems:'center', gap:'0.3rem' }}>
                    <RefreshCw size={14} /> Resend OTP
                  </button>
                )}
              </div>

              <div className="text-center mt-3" style={{ fontSize:'0.9rem', color:'var(--text-muted)' }}>
                <button onClick={() => { setStep(1); setError(''); setSuccess(''); setOtpDigits(['','','','','','']); }}
                  style={{ background:'none', border:'none', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'0.3rem' }} className="link">
                  <ArrowLeft size={14} /> Try different email
                </button>
              </div>
            </>
          )}

          {/* ── Step 3: New Password ── */}
          {step === 3 && (
            <>
              <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
                <div style={{ width:'64px', height:'64px', borderRadius:'50%', background:'rgba(16,185,129,0.15)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1rem' }}>
                  <KeyRound size={28} color="#10b981" />
                </div>
                <h1 className="auth-title">Reset Password</h1>
                <p className="auth-subtitle" style={{ marginBottom:0 }}>
                  Welcome, <strong style={{ WebkitTextFillColor:'#818cf8' }}>{userName}</strong>. Set your new password.
                </p>
              </div>

              <form onSubmit={handleResetPassword}>
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <div style={{ position:'relative' }}>
                    <input type={showPassword ? 'text' : 'password'} className="form-input"
                      value={newPassword} onChange={e => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters" required minLength={6} autoFocus />
                    <button type="button" onClick={() => setShowPassword(p => !p)}
                      style={{ position:'absolute', right:'0.75rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer' }}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm New Password</label>
                  <div style={{ position:'relative' }}>
                    <input type={showConfirm ? 'text' : 'password'} className="form-input"
                      value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password" required minLength={6} />
                    <button type="button" onClick={() => setShowConfirm(p => !p)}
                      style={{ position:'absolute', right:'0.75rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer' }}>
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom:'1rem', padding:'0.6rem 0.8rem', borderRadius:'8px', background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)' }}>
                  {[
                    { ok: newPassword.length >= 6, text: 'At least 6 characters' },
                    { ok: newPassword && newPassword === confirmPassword, text: 'Passwords match' },
                  ].map(r => (
                    <div key={r.text} style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontSize:'0.78rem', color: r.ok ? '#10b981' : 'var(--text-muted)', marginBottom:'0.2rem' }}>
                      <CheckCircle size={12} /> {r.text}
                    </div>
                  ))}
                </div>

                {errorBox(error)}

                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <><Loader size={16} style={{ animation:'spin 1s linear infinite' }} /> Resetting...</> : <><KeyRound size={18} /> Reset Password</>}
                </button>
              </form>
            </>
          )}

          {/* ── Step 4: Success ── */}
          {step === 4 && (
            <div style={{ textAlign:'center', padding:'1rem 0' }}>
              <div style={{ width:'80px', height:'80px', borderRadius:'50%', background:'rgba(16,185,129,0.15)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1.5rem', animation:'fadeScaleIn 0.4s ease' }}>
                <CheckCircle size={40} color="#10b981" />
              </div>
              <h1 className="auth-title" style={{ marginBottom:'0.5rem' }}>Password Reset Successful!</h1>
              <p style={{ color:'var(--text-muted)', fontSize:'0.95rem', marginBottom:'2rem' }}>
                Your password has been updated. You can now sign in with your new password.
              </p>
              <button onClick={() => navigate('/login')} className="btn btn-primary">
                <ArrowLeft size={18} /> Back to Login
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeScaleIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
};

export default ForgotPassword;
