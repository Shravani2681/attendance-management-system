import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import { ArrowLeft, LogOut, Plus, Edit2, Check, X, Briefcase, Users, CalendarDays, Loader } from 'lucide-react';

const PerformancePage = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const todayIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).toISOString().split('T')[0];

  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId]       = useState(null);
  const [editData, setEditData]   = useState({});
  const [msg, setMsg]             = useState({ type: '', text: '' });
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ date: todayIST, today_work: '', num_clients: '' });

  const notify = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg({ type: '', text: '' }), 3500);
  };

  const fetchRecords = async () => {
    try {
      const res = await api.get('/performance/my');
      setRecords(res.data.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRecords(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.today_work.trim()) return notify('error', 'Please describe today\'s work.');
    setSubmitting(true);
    try {
      await api.post('/performance', {
        date: form.date,
        today_work: form.today_work,
        num_clients: parseInt(form.num_clients) || 0,
      });
      notify('success', '✅ Performance record submitted!');
      setForm({ date: todayIST, today_work: '', num_clients: '' });
      setShowForm(false);
      fetchRecords();
    } catch (err) {
      notify('error', err.response?.data?.message || 'Submission failed');
    } finally { setSubmitting(false); }
  };

  const startEdit = (r) => {
    setEditId(r.id);
    setEditData({ today_work: r.today_work, num_clients: r.num_clients });
  };

  const cancelEdit = () => { setEditId(null); setEditData({}); };

  const saveEdit = async (id) => {
    try {
      await api.put(`/performance/${id}`, editData);
      notify('success', '✅ Record updated!');
      setEditId(null);
      fetchRecords();
    } catch (err) {
      notify('error', err.response?.data?.message || 'Update failed');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>

      {/* Header */}
      <header style={{ background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '8px', padding: '0.4rem 0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.4rem' }}>📊</span>
            <h1 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0 }}>My Performance</h1>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right', display: 'none' }} className="hide-mobile">
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user?.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user?.department}</div>
          </div>
          <button onClick={logout} className="btn btn-danger" style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
            <LogOut size={15} /> Logout
          </button>
        </div>
      </header>

      <main style={{ maxWidth: '860px', margin: '0 auto', padding: '2rem 1rem' }}>

        {/* Notification */}
        {msg.text && (
          <div style={{ padding: '0.9rem 1.2rem', borderRadius: '10px', marginBottom: '1rem', fontWeight: 500, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem', background: msg.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${msg.type === 'success' ? 'var(--success)' : 'var(--danger)'}`, color: msg.type === 'success' ? 'var(--success)' : 'var(--danger)' }}>
            {msg.type === 'success' ? <Check size={16} /> : <X size={16} />} {msg.text}
          </div>
        )}

        {/* Action Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', margin: 0 }}>Performance Log</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0.2rem 0 0' }}>{records.length} record{records.length !== 1 ? 's' : ''} submitted</p>
          </div>
          <button
            onClick={() => setShowForm(f => !f)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--primary)', color: '#fff', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', transition: 'all 0.2s' }}
          >
            <Plus size={16} /> {showForm ? 'Cancel' : 'Add Entry'}
          </button>
        </div>

        {/* Submission Form */}
        {showForm && (
          <div className="glass-card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
            <h3 style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '1.2rem', color: 'var(--text-muted)' }}>New Performance Entry</h3>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <CalendarDays size={13} /> Date <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input type="date" className="form-input" value={form.date} max={todayIST}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Users size={13} /> Number of Clients
                  </label>
                  <input type="number" className="form-input" min="0" placeholder="0"
                    value={form.num_clients}
                    onChange={e => setForm(f => ({ ...f, num_clients: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Briefcase size={13} /> Today's Work <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <textarea className="form-input" rows={3} placeholder="Describe what you worked on today..."
                  value={form.today_work} required
                  onChange={e => setForm(f => ({ ...f, today_work: e.target.value }))}
                  style={{ resize: 'vertical', minHeight: '80px' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.8rem' }}>
                <button type="submit" disabled={submitting}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'var(--primary)', color: '#fff', border: 'none', padding: '0.75rem', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                  {submitting ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Submitting…</> : <><Check size={15} /> Submit Entry</>}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  style={{ padding: '0.75rem 1.2rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Records Table */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '1.2rem' }}>Submitted Records</h3>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <Loader size={32} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <Briefcase size={40} style={{ marginBottom: '1rem', opacity: 0.4 }} />
              <p>No performance records yet.</p>
              <p style={{ fontSize: '0.85rem' }}>Click "Add Entry" to submit your first record.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    {['Date', "Today's Work", 'Clients', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: i < records.length - 1 ? '1px solid var(--border)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '0.9rem 1rem', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{r.date}</td>
                      <td style={{ padding: '0.9rem 1rem', maxWidth: '320px' }}>
                        {editId === r.id ? (
                          <textarea className="form-input" rows={2} value={editData.today_work}
                            onChange={e => setEditData(d => ({ ...d, today_work: e.target.value }))}
                            style={{ resize: 'vertical', fontSize: '0.85rem', padding: '0.4rem 0.6rem' }} />
                        ) : (
                          <span style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>{r.today_work}</span>
                        )}
                      </td>
                      <td style={{ padding: '0.9rem 1rem', textAlign: 'center' }}>
                        {editId === r.id ? (
                          <input type="number" min="0" className="form-input" value={editData.num_clients}
                            onChange={e => setEditData(d => ({ ...d, num_clients: e.target.value }))}
                            style={{ width: '80px', textAlign: 'center', padding: '0.4rem', fontSize: '0.85rem' }} />
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(99,102,241,0.12)', color: '#818cf8', padding: '0.2rem 0.7rem', borderRadius: '999px', fontWeight: 600, fontSize: '0.82rem' }}>
                            <Users size={12} /> {r.num_clients}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.9rem 1rem', whiteSpace: 'nowrap' }}>
                        {editId === r.id ? (
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button onClick={() => saveEdit(r.id)} style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px', padding: '0.35rem 0.7rem', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <Check size={13} /> Save
                            </button>
                            <button onClick={cancelEdit} style={{ background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.35rem 0.7rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(r)} style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '6px', padding: '0.35rem 0.7rem', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Edit2 size={13} /> Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default PerformancePage;
