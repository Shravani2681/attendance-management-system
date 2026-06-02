import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import Camera from '../components/Camera';
import { format } from 'date-fns';
import { LogOut, CheckCircle, Clock, MapPin, AlertCircle, Camera as CameraIcon, CalendarCheck, TrendingUp } from 'lucide-react';

const EmployeeDashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCamera, setShowCamera] = useState(false);
  const [cameraAction, setCameraAction] = useState('checkin');
  const [todayRecord, setTodayRecord] = useState(null);
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState('');

  const fetchDashboardData = async () => {
    try {
      const [todayRes, historyRes, summaryRes] = await Promise.all([
        api.get('/attendance/today'),
        api.get('/attendance/my'),
        api.get('/attendance/summary')
      ]);
      setTodayRecord(todayRes.data.record);
      setHistory(historyRes.data.data);
      setSummary(summaryRes.data.summary);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Two-stage GPS: high-accuracy first, network fallback
  const requireGPS = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('GPS not supported on this device.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => reject(new Error('GPS location access was denied. Please enable location and try again.')),
            { timeout: 8000, enableHighAccuracy: false, maximumAge: 30000 }
          );
        },
        { timeout: 10000, enableHighAccuracy: true, maximumAge: 0 }
      );
    });

  const handleMarkAttendance = async (imageBase64) => {
    setShowCamera(false);
    setMarking(true);
    setError('');

    // ── Check-Out flow ──
    if (cameraAction === 'checkout') {
      let gps = { lat: null, lng: null };
      try {
        gps = await requireGPS();
      } catch (gpsErr) {
        console.warn('GPS failed for checkout:', gpsErr.message);
      }
      try {
        await api.post('/attendance/checkout', {
          checkout_selfie: imageBase64,
          checkout_latitude: gps.lat,
          checkout_longitude: gps.lng,
        });
        await fetchDashboardData();
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to check out');
      } finally {
        setMarking(false);
      }
      return;
    }

    // ── Check-In flow ──
    let gps = { lat: null, lng: null };
    try {
      gps = await requireGPS();
    } catch (gpsErr) {
      setError('Camera and GPS Location access are required for attendance.');
      setMarking(false);
      return;
    }

    try {
      await api.post('/attendance/mark', {
        selfie: imageBase64,
        latitude: gps.lat,
        longitude: gps.lng,
      });
      await fetchDashboardData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to mark attendance');
    } finally {
      setMarking(false);
    }
  };

  const getStatusDetails = (record) => {
    if (!record || record.salary_type === 'ABSENT') {
      return { class: 'status-badge status-badge-absent', icon: '❌', label: 'Absent' };
    }
    
    if (record.salary_type === 'HALF') {
      return { class: 'status-badge status-badge-half', icon: '⚠️', label: 'Half Day' };
    }

    if (record.checkout_deduction_amount > 0) {
      return { class: 'status-badge status-badge-late', icon: '🏃', label: 'Early Check-Out' };
    }

    if (record.deduction_amount > 0) {
      return { class: 'status-badge status-badge-late', icon: '⏰', label: 'Late Check-In' };
    }

    return { class: 'status-badge status-badge-full', icon: '✅', label: 'Present' };
  };

  if (loading) return <div className="auth-page">Loading...</div>;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="user-info">
          <div className="user-avatar">{user.name.charAt(0).toUpperCase()}</div>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '600' }}>{user.name}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{user.department}</p>
          </div>
        </div>
        <div className="mobile-actions">
          <button
            onClick={() => navigate('/attendance')}
            className="btn"
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <CalendarCheck size={16} /> Attendance
          </button>
          <button
            onClick={() => navigate('/performance')}
            className="btn"
            style={{ background: '#8b5cf6', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <TrendingUp size={16} /> Performance
          </button>
          <button onClick={logout} className="btn btn-danger">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="glass-card stat-card">
          <div className="stat-title">Current Time</div>
          <div className="clock">{format(currentTime, 'hh:mm:ss a')}</div>
          <div className="text-center" style={{ color: 'var(--text-muted)' }}>
            {format(currentTime, 'EEEE, MMMM do, yyyy')}
          </div>
        </div>

        <div className="glass-card stat-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {todayRecord ? (
            <div className="text-center flex flex-col items-center gap-2">
              <CheckCircle size={48} color="var(--success)" />
              <h3 style={{ fontSize: '1.2rem', marginTop: '1rem' }}>Attendance Marked</h3>
              <span className={getStatusDetails(todayRecord).class}>
                {getStatusDetails(todayRecord).icon} {getStatusDetails(todayRecord).label}
              </span>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                Check-in: {todayRecord.check_in_time}
                {todayRecord.check_out_time ? ` | Check-out: ${todayRecord.check_out_time}` : ''}
              </p>
              {!todayRecord.check_out_time && (
                <button 
                  onClick={() => { setCameraAction('checkout'); setShowCamera(true); }} 
                  className="btn mt-4" 
                  style={{ padding: '0.8rem 1.5rem', background: 'var(--warning)', color: 'white', border: 'none' }}
                  disabled={marking}
                >
                  {marking ? 'Processing...' : <><CameraIcon size={20} /> Check Out</>}
                </button>
              )}
              {error && <p className="error-text mt-4">{error}</p>}
            </div>
          ) : (
            <div className="text-center" style={{ width: '100%' }}>
              <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>You haven't marked attendance today</p>
              <button 
                onClick={() => navigate('/attendance')} 
                className="btn btn-primary" 
                style={{ padding: '1rem' }}
              >
                <CalendarCheck size={20} /> Go to Attendance
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="stats-grid">
        <div className="glass-card stat-card">
          <div className="stat-title">Full Days (This Month)</div>
          <div className="stat-value text-success" style={{ color: 'var(--success)' }}>{summary?.fullDays || 0}</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-title">Half Days</div>
          <div className="stat-value text-warning" style={{ color: 'var(--warning)' }}>{summary?.halfDays || 0}</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-title">Estimated Earned</div>
          <div className="stat-value">₹{summary?.earned || 0}</div>
        </div>
      </div>

      <div className="glass-card mt-4">
        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>Recent Attendance History</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Status</th>
                <th>Deductions</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan="5" className="text-center text-muted">No records found</td></tr>
              ) : (
                history.map(record => (
                  <tr key={record.id}>
                    <td>{record.date}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Clock size={14} color="var(--text-muted)" />
                        {record.check_in_time}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {record.check_out_time ? (
                          <><Clock size={14} color="var(--text-muted)" /> {record.check_out_time}</>
                        ) : '-'}
                      </div>
                    </td>
                    <td>
                      <span className={getStatusDetails(record).class}>
                        {getStatusDetails(record).icon} {getStatusDetails(record).label}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2" style={{ fontWeight: '500' }}>
                        {(record.deduction_amount || 0) + (record.checkout_deduction_amount || 0) > 0 ? (
                          <span style={{ color: 'var(--danger)' }}>
                            ₹{(record.deduction_amount || 0) + (record.checkout_deduction_amount || 0)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCamera && <Camera onCapture={handleMarkAttendance} onClose={() => setShowCamera(false)} />}
    </div>
  );
};

export default EmployeeDashboard;
