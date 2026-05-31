import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import Camera from '../components/Camera';
import { format } from 'date-fns';
import {
  Camera as CameraIcon, CheckCircle, Clock, MapPin, AlertCircle,
  ArrowLeft, LogOut, Loader, XCircle, CalendarDays, IndianRupee, Navigation
} from 'lucide-react';

const AttendancePage = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [currentTime, setCurrentTime]     = useState(new Date());
  const [showCamera, setShowCamera]       = useState(false);
  const [cameraAction, setCameraAction]   = useState('checkin');
  const [todayRecord, setTodayRecord]     = useState(null);
  const [history, setHistory]             = useState([]);
  const [summary, setSummary]             = useState(null);
  const [loading, setLoading]             = useState(true);
  const [marking, setMarking]             = useState(false);
  const [error, setError]                 = useState('');
  const [success, setSuccess]             = useState('');
  const [gpsStatus, setGpsStatus]         = useState('idle');
  const [activeSection, setActiveSection] = useState('mark');
  const [todayDateIST, setTodayDateIST]   = useState(() => {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toISOString().split('T')[0];
  });

  // Live clock + midnight auto-reset
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      // Recompute IST date — if it changed, reset today's record
      const newDateIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toISOString().split('T')[0];
      setTodayDateIST(prev => {
        if (prev !== newDateIST) {
          // New day: clear today's record so attendance is re-enabled
          setTodayRecord(null);
          setError('');
          setSuccess('');
          fetchData();
          return newDateIST;
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [todayRes, historyRes, summaryRes] = await Promise.all([
        api.get('/attendance/today'),
        api.get('/attendance/my'),
        api.get('/attendance/summary'),
      ]);
      setTodayRecord(todayRes.data.record);
      setHistory(historyRes.data.data || []);
      setSummary(summaryRes.data.summary);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Returns GPS coords — tries high-accuracy first, falls back to network-accuracy
  const requireGPS = () =>
    new Promise((resolve, reject) => {
      setGpsStatus('fetching');
      if (!navigator.geolocation) {
        setGpsStatus('failed');
        reject(new Error('GPS not supported on this device.'));
        return;
      }

      // Stage 1: high accuracy (device GPS chip)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsStatus('ok');
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        },
        () => {
          // Stage 2: network / IP accuracy fallback
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setGpsStatus('ok');
              resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
            },
            () => {
              setGpsStatus('failed');
              reject(new Error('GPS location access was denied. Please enable location and try again.'));
            },
            { timeout: 8000, enableHighAccuracy: false, maximumAge: 30000 }
          );
        },
        { timeout: 10000, enableHighAccuracy: true, maximumAge: 0 }
      );
    });

  // Called by Camera component after taking the selfie
  const handleCapture = async (imageBase64) => {
    setShowCamera(false);
    setMarking(true);
    setError(''); setSuccess('');

    // ── Check-Out flow ──
    if (cameraAction === 'checkout') {
      let gps;
      try {
        gps = await requireGPS();
      } catch (gpsErr) {
        setError('Camera and GPS Location access are required for attendance.');
        setMarking(false); setGpsStatus('idle');
        return;
      }
      try {
        const res = await api.post('/attendance/checkout', {
          checkout_selfie: imageBase64,
          checkout_latitude: gps.lat,
          checkout_longitude: gps.lng,
        });
        const { checkout_deduction_amount, checkout_deduction_reason, salary_type } = res.data;
        let msg = '✅ Checked out successfully!';
        if (salary_type === 'HALF') {
          msg += ' ⚠️ Marked as Half Day (early checkout).';
        } else if (checkout_deduction_amount > 0) {
          msg += ` ₹${checkout_deduction_amount} deducted — ${checkout_deduction_reason}.`;
        } else {
          msg += ' Full salary for today. 🎉';
        }
        setSuccess(msg);
        await fetchData();
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to check out.');
      } finally {
        setMarking(false); setGpsStatus('idle');
      }
      return;
    }

    // ── Check-In flow ──
    let gps;
    try {
      gps = await requireGPS();
    } catch (gpsErr) {
      setError('Camera and GPS Location access are required for attendance.');
      setMarking(false); setGpsStatus('idle');
      return;
    }

    try {
      await api.post('/attendance/mark', {
        selfie: imageBase64,
        latitude: gps.lat,
        longitude: gps.lng,
      });
      setSuccess('✅ Attendance marked successfully!');
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to mark attendance.');
    } finally {
      setMarking(false); setGpsStatus('idle');
    }
  };

  // Derived state — is today fully done?
  const checkedInToday  = !!todayRecord && todayRecord.date === todayDateIST;
  const checkedOutToday = checkedInToday && !!todayRecord.check_out_time;
  const dayComplete     = checkedInToday && checkedOutToday;

  const openCamera = (action) => {
    // Guard: block if already done for today
    if (action === 'checkin' && checkedInToday) {
      setError('You have already checked in today. Check-in is allowed only once per day.');
      return;
    }
    if (action === 'checkout' && checkedOutToday) {
      setError('You have already checked out today. Check-out is allowed only once per day.');
      return;
    }
    if (dayComplete) {
      setError('Attendance is complete for today. Camera will be available again tomorrow.');
      return;
    }
    setError(''); setSuccess('');
    setCameraAction(action);
    setShowCamera(true);
  };

  const getStatusDetails = (record) => {
    if (!record) return { class: 'status-badge status-badge-absent', icon: '❌', label: 'Absent' };
    
    // Fallback logic for old records without a status column yet
    const fallbackStatus = record.salary_type === 'HALF' ? 'Half Day'
      : record.checkout_deduction_amount > 0 ? 'Early Check-Out'
      : record.deduction_amount > 0 ? 'Late Check-In' : 'Full Day';

    let status = record.status || fallbackStatus;
    if (status === 'Present') status = 'Full Day';
    if (status === 'Late') status = 'Late Check-In';

    switch(status) {
      case 'Full Day':        return { class: 'status-badge status-badge-full',    icon: '✅', label: 'Full Day', color: '#10b981' };
      case 'Late Check-In':   return { class: 'status-badge status-badge-warning', icon: '⏰', label: 'Late Check-In', color: '#f97316' };
      case 'Half Day':        return { class: 'status-badge status-badge-half',    icon: '⚠️', label: 'Half Day', color: '#eab308' };
      case 'Early Check-Out': return { class: 'status-badge status-badge-info',    icon: '🏃', label: 'Early Check-Out', color: '#3b82f6' };
      case 'Absent':          return { class: 'status-badge status-badge-absent',  icon: '❌', label: 'Absent', color: '#ef4444' };
      default:                return { class: 'status-badge',                      icon: '●',  label: status, color: 'var(--text-muted)' };
    }
  };

  // Shorten long addresses for display
  const shortAddr = (addr) => {
    if (!addr) return null;
    const parts = addr.split(',');
    return parts.slice(0, 3).join(',');
  };

  // Badge color based on salary type
  const getBadgeColor = (type) => {
    if (type === 'FULL') return 'var(--success)';
    if (type === 'HALF') return 'var(--warning)';
    return 'var(--danger)';
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>

      {/* ── Header ── */}
      <header style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '8px', padding: '0.4rem 0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <ArrowLeft size={16} /> Back
          </button>
          <h1 style={{ fontSize: '1.3rem', fontWeight: '700', margin: 0 }}>📍 Attendance</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{user?.name}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user?.department}</div>
          </div>
          <button onClick={logout} className="btn btn-danger" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
            <LogOut size={15} /> Logout
          </button>
        </div>
      </header>

      {/* ── Sub-nav ── */}
      <div style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', display: 'flex', padding: '0 2rem' }}>
        {[{ id: 'mark', label: '📸 Mark Attendance' }, { id: 'history', label: '📋 My History' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveSection(tab.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.8rem 1.2rem', fontSize: '0.9rem', fontWeight: activeSection === tab.id ? '700' : '400', color: activeSection === tab.id ? 'var(--primary)' : 'var(--text-muted)', borderBottom: activeSection === tab.id ? '2px solid var(--primary)' : '2px solid transparent', transition: 'all 0.2s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      <main style={{ maxWidth: '760px', margin: '0 auto', padding: '2rem 1rem' }}>

        {/* ══════════ MARK ATTENDANCE ══════════ */}
        {activeSection === 'mark' && (
          <>
            {/* Permission warning banner */}
            <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '10px', padding: '0.8rem 1.2rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem', fontSize: '0.85rem' }}>
              <span style={{ fontSize: '1.2rem' }}>ℹ️</span>
              <span style={{ color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Camera and GPS Location</strong> access are required to mark attendance. Please allow both when prompted.
              </span>
            </div>

            {/* Live Clock */}
            <div className="glass-card" style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '1.5rem' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>{format(currentTime, 'EEEE, MMMM do, yyyy')}</div>
              <div className="clock" style={{ fontSize: '2.8rem', letterSpacing: '0.05em' }}>{format(currentTime, 'hh:mm:ss a')}</div>

              {/* ── Check-In Rules ── */}
              <div style={{ marginTop: '1rem', marginBottom: '0.4rem', fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Check-In Rules</div>
              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
                <span style={{ fontSize: '0.73rem', padding: '0.3rem 0.7rem', borderRadius: '20px', background: 'rgba(16,185,129,0.15)', color: 'var(--success)' }}>Before 10:15 AM → Full Salary</span>
                <span style={{ fontSize: '0.73rem', padding: '0.3rem 0.7rem', borderRadius: '20px', background: 'rgba(245,158,11,0.15)', color: 'var(--warning)' }}>10:15 AM – 1:00 PM → -₹50</span>
                <span style={{ fontSize: '0.73rem', padding: '0.3rem 0.7rem', borderRadius: '20px', background: 'rgba(239,68,68,0.15)', color: 'var(--danger)' }}>After 1:00 PM → Half Day</span>
              </div>

              {/* ── Check-Out Rules ── */}
              <div style={{ marginTop: '0.2rem', marginBottom: '0.4rem', fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Check-Out Rules</div>
              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.73rem', padding: '0.3rem 0.7rem', borderRadius: '20px', background: 'rgba(239,68,68,0.15)', color: 'var(--danger)' }}>Before 2:00 PM → Half Day</span>
                <span style={{ fontSize: '0.73rem', padding: '0.3rem 0.7rem', borderRadius: '20px', background: 'rgba(245,158,11,0.15)', color: 'var(--warning)' }}>2:00 – 3:00 PM → -₹100</span>
                <span style={{ fontSize: '0.73rem', padding: '0.3rem 0.7rem', borderRadius: '20px', background: 'rgba(251,191,36,0.15)', color: '#d97706' }}>3:00 – 4:30 PM → -₹50</span>
                <span style={{ fontSize: '0.73rem', padding: '0.3rem 0.7rem', borderRadius: '20px', background: 'rgba(16,185,129,0.15)', color: 'var(--success)' }}>After 4:30 PM → Full Salary</span>
              </div>
            </div>

            {loading ? (
              <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
                <Loader size={40} style={{ animation: 'spin 1s linear infinite' }} />
                <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Loading…</p>
              </div>
            ) : (
              <div className="glass-card" style={{ marginBottom: '1.5rem', padding: '2rem' }}>
                {todayRecord ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.2rem', textAlign: 'center' }}>
                    <CheckCircle size={56} color={getBadgeColor(todayRecord.salary_type)} />
                    <div>
                      <h2 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '0.3rem' }}>Attendance Recorded</h2>
                      <span className={getStatusDetails(todayRecord).class}>
                        {getStatusDetails(todayRecord).icon} {getStatusDetails(todayRecord).label}
                      </span>
                      {todayRecord.deduction_amount > 0 && (
                        <div style={{ marginTop: '0.4rem', color: 'var(--danger)', fontSize: '0.85rem', fontWeight: '600' }}>Late check-in: -₹{todayRecord.deduction_amount}</div>
                      )}
                      {todayRecord.checkout_deduction_amount > 0 && (
                        <div style={{ marginTop: '0.3rem', color: 'var(--danger)', fontSize: '0.85rem', fontWeight: '600' }}>Early checkout: -₹{todayRecord.checkout_deduction_amount}</div>
                      )}
                      {todayRecord.checkout_deduction_reason && (
                        <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{todayRecord.checkout_deduction_reason}</div>
                      )}
                    </div>

                    {/* Selfies row */}
                    <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                      {todayRecord.selfie && (
                        <div style={{ textAlign: 'center' }}>
                          <img src={todayRecord.selfie} alt="Check-in selfie" style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--success)' }} />
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>Check-In</div>
                        </div>
                      )}
                      {todayRecord.checkout_selfie && (
                        <div style={{ textAlign: 'center' }}>
                          <img src={todayRecord.checkout_selfie} alt="Check-out selfie" style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--warning)' }} />
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>Check-Out</div>
                        </div>
                      )}
                    </div>

                    {/* Times */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', width: '100%' }}>
                      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '1rem' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Clock size={12} /> Check-In Time</div>
                        <div style={{ fontWeight: '700', fontSize: '1.1rem' }}>{todayRecord.check_in_time}</div>
                        {todayRecord.checkin_address && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem', display: 'flex', alignItems: 'flex-start', gap: '0.3rem' }}>
                            <MapPin size={11} style={{ flexShrink: 0, marginTop: '2px' }} />{shortAddr(todayRecord.checkin_address)}
                          </div>
                        )}
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '1rem' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Clock size={12} /> Check-Out Time</div>
                        <div style={{ fontWeight: '700', fontSize: '1.1rem' }}>{todayRecord.check_out_time || '—'}</div>
                        {todayRecord.checkout_address && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem', display: 'flex', alignItems: 'flex-start', gap: '0.3rem' }}>
                            <MapPin size={11} style={{ flexShrink: 0, marginTop: '2px' }} />{shortAddr(todayRecord.checkout_address)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Check-Out button or Day-Complete badge */}
                    {dayComplete ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid var(--success)', borderRadius: '12px', padding: '0.8rem 1.8rem', display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--success)', fontWeight: '600' }}>
                          <CheckCircle size={18} /> Attendance Complete for Today
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                          Camera will be available again tomorrow ({new Date(new Date(todayDateIST + 'T00:00:00').getTime() + 86400000).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })})
                        </p>
                      </div>
                    ) : !todayRecord.check_out_time ? (
                      <button className="btn" style={{ background: 'var(--warning)', color: '#fff', border: 'none', padding: '0.8rem 2rem' }}
                        onClick={() => openCamera('checkout')} disabled={marking}>
                        {marking ? <><Loader size={16} /> Processing…</> : <><CameraIcon size={16} /> Check Out</>}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                    <XCircle size={56} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
                    <h2 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '0.5rem' }}>Not Marked Yet</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                      Allow camera &amp; GPS, take a selfie — timestamp &amp; location will be captured automatically.
                    </p>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '1rem 2.5rem', fontSize: '1rem' }}
                      onClick={() => openCamera('checkin')}
                      disabled={marking || checkedInToday}
                    >
                      {marking
                        ? <><Loader size={18} /> Processing…</>
                        : checkedInToday
                          ? <><CheckCircle size={18} /> Already Checked In</>
                          : <><CameraIcon size={18} /> Mark Attendance</>}
                    </button>
                    {checkedInToday && (
                      <p style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Check-in recorded. Use the <strong>Check Out</strong> button when leaving.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Status banners */}
            {gpsStatus === 'fetching' && (
              <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.5rem', marginBottom: '1rem' }}>
                <Loader size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                <span>Fetching GPS location — please wait…</span>
              </div>
            )}
            {success && (
              <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.5rem', marginBottom: '1rem', borderColor: 'var(--success)' }}>
                <CheckCircle size={20} color="var(--success)" />
                <span style={{ color: 'var(--success)' }}>{success}</span>
              </div>
            )}
            {error && (
              <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.5rem', borderColor: 'var(--danger)' }}>
                <AlertCircle size={20} color="var(--danger)" />
                <span style={{ color: 'var(--danger)', fontWeight: 500 }}>{error}</span>
              </div>
            )}
          </>
        )}

        {/* ══════════ HISTORY ══════════ */}
        {activeSection === 'history' && (
          <>
            {summary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                  { label: 'Full Days', value: summary.fullDays, color: 'var(--success)', icon: '✅' },
                  { label: 'Half Days', value: summary.halfDays, color: 'var(--warning)', icon: '⚠️' },
                  { label: 'Absent Days', value: Math.max(0, 26 - (summary.fullDays + summary.halfDays)), color: '#991b1b', icon: '🚫' },
                  { label: 'Deductions', value: `₹${summary.totalDeductions || 0}`, color: 'var(--danger)', icon: '📉' },
                  { label: 'Est. Earned', value: `₹${summary.earned}`, color: 'var(--primary)', icon: '💰' },
                ].map(stat => (
                  <div key={stat.label} className="glass-card stat-card" style={{ padding: '1rem' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>{stat.icon}</span>
                      {stat.label}
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: stat.color }}>{stat.value}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="glass-card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📋 Attendance History
                <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {history.length} records this month
                </span>
              </h3>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}><Loader size={30} style={{ animation: 'spin 1s linear infinite' }} /></div>
              ) : (
                <div className="att-history-container" style={{ overflowX: 'auto' }}>
                  <table className="att-history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Check-In</th>
                        <th>Check-Out</th>
                        <th>Status</th>
                        <th>Deductions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Build a map of attendance records by date
                        const recordsByDate = {};
                        history.forEach(r => { recordsByDate[r.date] = r; });

                        // Generate all dates for the current month up to today
                        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
                        const year = now.getFullYear();
                        const month = now.getMonth();
                        const today = now.getDate();
                        const allDates = [];
                        for (let d = today; d >= 1; d--) {
                          const dateObj = new Date(year, month, d);
                          const day = dateObj.getDay();
                          // Skip Sundays (day === 0)
                          if (day === 0) continue;
                          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                          allDates.push(dateStr);
                        }

                        if (allDates.length === 0) {
                          return <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No attendance records yet</td></tr>;
                        }

                        return allDates.map(dateStr => {
                          const record = recordsByDate[dateStr];
                          const dateObj = new Date(dateStr + 'T00:00:00');
                          const dayName = dateObj.toLocaleDateString('en-IN', { weekday: 'short' });
                          const displayDate = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

                          if (!record) {
                            // ABSENT — no record for this date
                            return (
                              <tr key={dateStr}>
                                <td data-label="Date">
                                  <div style={{ fontWeight: 600 }}>{displayDate}</div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{dayName}</div>
                                </td>
                                <td data-label="Check-In" style={{ color: 'var(--text-muted)' }}>—</td>
                                <td data-label="Check-Out" style={{ color: 'var(--text-muted)' }}>—</td>
                                <td data-label="Status">
                                  <span className="status-badge status-badge-absent">❌ Absent</span>
                                </td>
                                <td data-label="Deductions" style={{ color: 'var(--text-muted)' }}>—</td>
                              </tr>
                            );
                          }

                          const statusDetails = getStatusDetails(record);
                          const totalDeduction = (record.deduction_amount || 0) + (record.checkout_deduction_amount || 0);

                          return (
                            <tr key={record.id || dateStr}>
                              <td data-label="Date">
                                <div style={{ fontWeight: 600 }}>{displayDate}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{dayName}</div>
                              </td>
                              <td data-label="Check-In">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  {record.selfie && (
                                    <img src={record.selfie} alt="in" style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--success)', flexShrink: 0 }} />
                                  )}
                                  <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                      <Clock size={12} color="var(--text-muted)" />{record.check_in_time}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td data-label="Check-Out">
                                {record.check_out_time ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {record.checkout_selfie && (
                                      <img src={record.checkout_selfie} alt="out" style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--warning)', flexShrink: 0 }} />
                                    )}
                                    <div>
                                      <div style={{ fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <Clock size={12} color="var(--text-muted)" />{record.check_out_time}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                                )}
                              </td>
                              <td data-label="Status">
                                <span className={statusDetails.class}>{statusDetails.icon} {statusDetails.label}</span>
                              </td>
                              <td data-label="Deductions">
                                {totalDeduction > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    {record.deduction_amount > 0 && (
                                      <span className="deduction-chip">Late -₹{record.deduction_amount}</span>
                                    )}
                                    {record.checkout_deduction_amount > 0 && (
                                      <span className="deduction-chip">Early -₹{record.checkout_deduction_amount}</span>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>—</span>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Only render camera when NOT day-complete */}
      {showCamera && !dayComplete && <Camera onCapture={handleCapture} onClose={() => setShowCamera(false)} />}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default AttendancePage;
