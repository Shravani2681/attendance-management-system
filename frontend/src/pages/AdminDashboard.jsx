import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import {
  LayoutDashboard, Users, ClipboardList, TrendingUp, LogOut,
  Download, Edit2, Trash2, Check, X, Menu, Search, IndianRupee, RefreshCw
} from 'lucide-react';

const S = { // shared inline style shortcuts
  badge: (c) => ({ display:'inline-flex', alignItems:'center', padding:'0.2rem 0.65rem', borderRadius:'999px', fontSize:'0.75rem', fontWeight:600, background: c==='FULL'?'rgba(16,185,129,0.15)':c==='HALF'?'rgba(245,158,11,0.15)':'rgba(239,68,68,0.15)', color: c==='FULL'?'#10b981':c==='HALF'?'#f59e0b':'#ef4444' }),
  btn: (bg,col) => ({ display:'inline-flex', alignItems:'center', gap:'0.35rem', padding:'0.35rem 0.75rem', borderRadius:'7px', border:'none', background:bg, color:col, cursor:'pointer', fontSize:'0.8rem', fontWeight:500 }),
  card: { background:'rgba(30,41,59,0.7)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'14px', padding:'1.5rem', overflow:'hidden' },
};

export default function AdminDashboard() {
  const { user, logout } = useContext(AuthContext);
  const [tab, setTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [salaryData, setSalaryData] = useState([]);
  const [salaryMonth, setSalaryMonth] = useState(new Date().toISOString().slice(0,7));
  const [salarySearch, setSalarySearch] = useState('');
  const [editSalary, setEditSalary] = useState(null);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [dlMonth, setDlMonth] = useState(new Date().toISOString().slice(0,7));
  const [attSearch, setAttSearch] = useState('');
  const [empSearch, setEmpSearch] = useState('');
  const [perfSearch, setPerfSearch] = useState('');
  const [editAtt, setEditAtt] = useState(null);
  const [editEmp, setEditEmp] = useState(null);
  const [editPerf, setEditPerf] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [s, a, e, p] = await Promise.all([
        api.get('/admin/stats'),
        api.get(`/admin/attendance-status?date=${filterDate}`),
        api.get('/admin/employees'),
        api.get('/admin/performance'),
      ]);
      setStats(s.data.stats);
      setAttendance(a.data.data || []);
      setEmployees(e.data.data || []);
      setPerformance(p.data.data || []);
    } catch(e){ console.error(e); } finally { setLoading(false); }
  };

  const loadSalary = async (m) => {
    setSalaryLoading(true);
    try {
      const r = await api.get(`/admin/salary?month=${m||salaryMonth}`);
      setSalaryData(r.data.data || []);
    } catch(e){ console.error(e); } finally { setSalaryLoading(false); }
  };

  useEffect(() => { load(); }, [filterDate]);
  useEffect(() => { if(tab==='salary') loadSalary(salaryMonth); }, [tab, salaryMonth]);

  // ── Downloads ──
  const download = async (url, name) => {
    const res = await api.get(url, { responseType:'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([res.data]));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };
  const dlAtt = () => download(`/admin/reports/download${dlMonth?`?month=${dlMonth}`:''}`, `Attendance_${dlMonth||'All'}.xlsx`);
  const dlEmp = () => download('/admin/employees/export', `Employees_${new Date().toISOString().slice(0,10)}.xlsx`);

  // ── Filtered lists ──
  const filtAtt  = attendance.filter(r => `${r.employee_name} ${r.department}`.toLowerCase().includes(attSearch.toLowerCase()));
  const filtEmp  = employees.filter(e => `${e.name} ${e.email} ${e.department}`.toLowerCase().includes(empSearch.toLowerCase()));
  const filtPerf = performance.filter(p => `${p.employee_name} ${p.department}`.toLowerCase().includes(perfSearch.toLowerCase()));
  const filtSalary = salaryData.filter(r => `${r.employee_name} ${r.department}`.toLowerCase().includes(salarySearch.toLowerCase()));

  // ── Status preset: derives salary_type + deductions from display status ──
  const applyStatusPreset = (status, current) => {
    // Parse checkout time to calculate early-checkout deduction
    const getCheckoutDeduction = (checkOutTime) => {
      if (!checkOutTime) return 0;
      const [h, m] = checkOutTime.split(':').map(Number);
      const mins = h * 60 + (m || 0);
      if (mins < 14 * 60) return 0;          // before 2 PM → HALF (handled by salary_type)
      if (mins < 15 * 60) return 100;        // 2 PM–3 PM → ₹100
      if (mins < 16 * 60 + 30) return 50;   // 3 PM–4:30 PM → ₹50
      return 0;                               // after 4:30 PM → full
    };

    switch (status) {
      case 'FULL_DAY':      return { ...current, salary_type:'FULL',   deduction_amount:0,  checkout_deduction_amount:0 };
      case 'HALF_DAY':      return { ...current, salary_type:'HALF',   deduction_amount:0,  checkout_deduction_amount:0 };
      case 'LATE_CHECKIN':  return { ...current, salary_type:'FULL',   deduction_amount:50, checkout_deduction_amount:0 };
      case 'EARLY_CHECKOUT':{
        const coDeduct = getCheckoutDeduction(current.check_out_time);
        // If checkout before 2 PM treat as Half Day
        const [h] = (current.check_out_time||'00:00').split(':').map(Number);
        const st = h < 14 ? 'HALF' : 'FULL';
        return { ...current, salary_type: st, deduction_amount:0, checkout_deduction_amount: coDeduct };
      }
      case 'ABSENT':        return { ...current, salary_type:'ABSENT', deduction_amount:0,  checkout_deduction_amount:0 };
      default:              return current;
    }
  };

  // Derive the display status key from a record
  const deriveStatus = (r) => {
    if (!r || r.salary_type === 'ABSENT') return 'ABSENT';
    if (r.salary_type === 'HALF')         return 'HALF_DAY';
    if ((r.checkout_deduction_amount||0) > 0) return 'EARLY_CHECKOUT';
    if ((r.deduction_amount||0) > 0)      return 'LATE_CHECKIN';
    return 'FULL_DAY';
  };

  // ── Save edits ──
  const saveAtt = async () => {
    await api.put(`/admin/attendance/${editAtt.id}`, {
      check_in_time:             editAtt.check_in_time,
      check_out_time:            editAtt.check_out_time,
      salary_type:               editAtt.salary_type,
      deduction_amount:          Number(editAtt.deduction_amount) || 0,
      checkout_deduction_amount: Number(editAtt.checkout_deduction_amount) || 0,
      status:                    editAtt.status || 'Present',
      notes:                     editAtt.notes,
    });
    setEditAtt(null);
    load();
    if (tab === 'salary') loadSalary(salaryMonth);
  };
  const saveEmp = async () => {
    await api.put(`/admin/employees/${editEmp.id}`, editEmp);
    setEditEmp(null); load();
  };
  const savePerf = async () => {
    await api.put(`/admin/performance/${editPerf.id}`, editPerf);
    setEditPerf(null); load();
  };
  const delPerf = async (id) => {
    await api.delete(`/admin/performance/${id}`);
    setDelConfirm(null); load();
  };
  const delEmp = async (id) => {
    await api.delete(`/admin/employees/${id}`);
    setDelConfirm(null); load();
  };

  const saveSalaryOverride = async () => {
    await api.put('/admin/salary/override', {
      employee_id: editSalary.employee_id,
      month: salaryMonth,
      earned_salary: editSalary.earned_salary,
      notes: editSalary.override_notes || ''
    });
    setEditSalary(null); loadSalary(salaryMonth);
  };

  const removeSalaryOverride = async (emp) => {
    await api.delete(`/admin/salary/override?employee_id=${emp.employee_id}&month=${salaryMonth}`);
    loadSalary(salaryMonth);
  };

  const dlSalary = () => download(`/admin/salary/download?month=${salaryMonth}`, `Salary_${salaryMonth}.xlsx`);

  // ── Sidebar nav items ──
  const navItems = [
    { id:'dashboard',   icon:<LayoutDashboard size={18}/>, label:'Dashboard' },
    { id:'attendance',  icon:<ClipboardList size={18}/>,   label:'Attendance Report' },
    { id:'employees',   icon:<Users size={18}/>,           label:'Employee Registration' },
    { id:'performance', icon:<TrendingUp size={18}/>,      label:'Performance Report' },
    { id:'salary',      icon:<IndianRupee size={18}/>,     label:'Salary Management' },
  ];

  return (
    <div className="admin-layout">
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && <div onClick={()=>setSidebarOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:190}}/>}

      {/* ── Sidebar ── */}
      <aside className={`admin-sidebar${sidebarOpen?' open':''}`}>
        <div className="admin-sidebar-logo">
          📊 AttendPro <span>Admin Dashboard</span>
        </div>
        <nav className="admin-nav">
          {navItems.map(n => (
            <button key={n.id} className={`admin-nav-item${tab===n.id?' active':''}`}
              onClick={()=>{ setTab(n.id); setSidebarOpen(false); }}>
              {n.icon} {n.label}
            </button>
          ))}
        </nav>
        <div style={{padding:'1rem', borderTop:'1px solid var(--border)'}}>
          <div style={{fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:'0.5rem'}}>{user?.email}</div>
          <button className="admin-nav-item danger" onClick={logout} style={{width:'100%', borderRadius:'8px'}}>
            <LogOut size={16}/> Logout
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="admin-main">
        {/* Topbar */}
        <div className="admin-topbar">
          <div style={{display:'flex', alignItems:'center', gap:'0.75rem'}}>
            <button className="sidebar-toggle" onClick={()=>setSidebarOpen(o=>!o)}><Menu size={18}/></button>
            <h1 style={{fontSize:'1.1rem', fontWeight:700, margin:0}}>
              {navItems.find(n=>n.id===tab)?.label || 'Dashboard'}
            </h1>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:'0.75rem', flexWrap:'wrap'}}>
            <input type="month" value={dlMonth} onChange={e=>setDlMonth(e.target.value)}
              style={{background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', color:'var(--text)', padding:'0.35rem 0.6rem', borderRadius:'7px', fontSize:'0.82rem'}}/>
            <button onClick={dlAtt} style={S.btn('rgba(16,185,129,0.2)','#10b981')}><Download size={14}/> Attendance</button>
            <button onClick={dlEmp} style={S.btn('rgba(139,92,246,0.2)','#a78bfa')}><Download size={14}/> Employees</button>
          </div>
        </div>

        <div className="admin-content">
          {loading && <div style={{textAlign:'center',padding:'4rem',color:'var(--text-muted)'}}>Loading…</div>}

          {/* ── DASHBOARD TAB ── */}
          {!loading && tab==='dashboard' && (
            <div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'1rem', marginBottom:'1.5rem'}}>
                {[
                  { label:'Total Employees', val:stats?.totalEmployees||0, color:'#818cf8', icon:'👥' },
                  { label:'Present Today',   val:stats?.presentToday||0,  color:'#10b981', icon:'✅' },
                  { label:'Half Day Today',  val:stats?.halfToday||0,     color:'#f59e0b', icon:'⚠️' },
                  { label:'Absent Today',    val:stats?.absentToday||0,   color:'#ef4444', icon:'❌' },
                ].map(s => (
                  <div key={s.label} className="adm-stat">
                    <div className="adm-stat-label">{s.icon} {s.label}</div>
                    <div className="adm-stat-val" style={{color:s.color}}>{s.val}</div>
                  </div>
                ))}
              </div>
              <div style={{...S.card, color:'var(--text-muted)', textAlign:'center', padding:'2rem'}}>
                <TrendingUp size={40} style={{marginBottom:'0.75rem', opacity:0.4}}/>
                <p>Select a section from the sidebar to manage data.</p>
              </div>
            </div>
          )}

          {/* ── ATTENDANCE TAB ── */}
          {!loading && tab==='attendance' && (
            <div style={S.card}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.75rem'}}>
                <div style={{display:'flex', alignItems:'center', gap:'0.75rem', flexWrap:'wrap'}}>
                  <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)}
                    style={{background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', color:'var(--text)', padding:'0.4rem 0.7rem', borderRadius:'8px', fontSize:'0.85rem'}}/>
                  <div style={{position:'relative'}}>
                    <Search size={14} style={{position:'absolute', left:'0.6rem', top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)'}}/>
                    <input className="search-input" style={{paddingLeft:'2rem'}} placeholder="Search employee…" value={attSearch} onChange={e=>setAttSearch(e.target.value)}/>
                  </div>
                </div>
                <span style={{fontSize:'0.82rem', color:'var(--text-muted)'}}>{filtAtt.length} records</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table className="adm-table">
                  <thead><tr>
                    <th style={{minWidth:56}}>In Photo</th>
                    <th style={{minWidth:56}}>Out Photo</th>
                    <th style={{minWidth:130}}>Employee Name</th>
                    <th style={{minWidth:110}}>Department</th>
                    <th style={{minWidth:150}}>Status</th>
                    <th style={{minWidth:110}}>Check-In Time</th>
                    <th style={{minWidth:110}}>Check-Out Time</th>
                    <th style={{minWidth:110}}>Deductions</th>
                    <th style={{minWidth:170}}>Check-In Address</th>
                    <th style={{minWidth:170}}>Check-Out Address</th>
                    <th style={{minWidth:70}}>Actions</th>
                  </tr></thead>
                  <tbody>
                    {filtAtt.length===0
                      ? <tr><td colSpan={11} style={{textAlign:'center',padding:'2rem',color:'var(--text-muted)'}}>No records found</td></tr>
                      : filtAtt.map(r => {
                          const lateDeduct     = r.deduction_amount || 0;
                          const checkoutDeduct = r.checkout_deduction_amount || 0;
                          const totalDeduct    = lateDeduct + checkoutDeduct;

                          const getStatus = () => {
                            if (!r.id) return { label:'Absent', bg:'rgba(239,68,68,0.12)', color:'#ef4444', icon:'❌' };
                            
                            let s = r.status || 'Full Day';
                            if (s === 'Present') s = 'Full Day';
                            if (s === 'Late') s = 'Late Check-In';

                            switch (s) {
                              case 'Full Day':        return { label:'Full Day',        bg:'rgba(16,185,129,0.15)', color:'#10b981', icon:'✅' };
                              case 'Late Check-In':   return { label:'Late Check-In',   bg:'rgba(249,115,22,0.15)', color:'#f97316', icon:'⏰' };
                              case 'Half Day':        return { label:'Half Day',        bg:'rgba(234,179,8,0.15)',  color:'#eab308', icon:'⚠️' };
                              case 'Early Check-Out': return { label:'Early Check-Out', bg:'rgba(59,130,246,0.15)', color:'#3b82f6', icon:'🏃' };
                              case 'Absent':          return { label:'Absent',          bg:'rgba(239,68,68,0.12)',  color:'#ef4444', icon:'❌' };
                              default:                return { label: s,                bg:'rgba(255,255,255,0.1)', color:'var(--text)', icon:'●' };
                            }
                          };
                          const st = getStatus();
                          const photoStyle = { width:42, height:42, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(99,102,241,0.5)', display:'block', margin:'auto' };
                          const emptyPhoto = <div style={{...photoStyle, background:'rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:'0.7rem'}}>—</div>;

                          return (
                            <tr key={r.employee_id}>
                              {/* In Photo */}
                              <td style={{textAlign:'center',padding:'0.5rem 0.75rem'}}>
                                {r.selfie ? <img src={r.selfie} style={photoStyle} alt="check-in"/> : emptyPhoto}
                              </td>
                              {/* Out Photo */}
                              <td style={{textAlign:'center',padding:'0.5rem 0.75rem'}}>
                                {r.checkout_selfie ? <img src={r.checkout_selfie} style={photoStyle} alt="check-out"/> : emptyPhoto}
                              </td>
                              {/* Employee Name */}
                              <td><div style={{fontWeight:600}}>{r.employee_name}</div></td>
                              {/* Department */}
                              <td style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>{r.department}</td>
                              {/* Status */}
                              <td>
                                <span style={{display:'inline-flex',alignItems:'center',gap:'0.35rem',padding:'0.25rem 0.7rem',borderRadius:'999px',fontSize:'0.75rem',fontWeight:700,background:st.bg,color:st.color,whiteSpace:'nowrap'}}>
                                  {st.icon} {st.label}
                                </span>
                              </td>
                              {/* Check-In Time */}
                              <td style={{fontFamily:'monospace',fontSize:'0.85rem',whiteSpace:'nowrap',color: lateDeduct>0 ? '#ef4444' : 'var(--text)'}}>
                                {r.check_in_time || <span style={{color:'var(--text-muted)'}}>—</span>}
                              </td>
                              {/* Check-Out Time */}
                              <td style={{fontFamily:'monospace',fontSize:'0.85rem',whiteSpace:'nowrap',color: checkoutDeduct>0 ? '#f97316' : 'var(--text)'}}>
                                {r.check_out_time || <span style={{color:'var(--text-muted)'}}>—</span>}
                              </td>
                              {/* Deductions */}
                              <td style={{textAlign:'center'}}>
                                {totalDeduct > 0 ? (
                                  <div>
                                    <div style={{fontWeight:700,color:'#ef4444'}}>-₹{totalDeduct}</div>
                                    {lateDeduct > 0 && <div style={{fontSize:'0.68rem',color:'#ef4444',opacity:0.75}}>Late: ₹{lateDeduct}</div>}
                                    {checkoutDeduct > 0 && <div style={{fontSize:'0.68rem',color:'#f97316',opacity:0.75}}>Checkout: ₹{checkoutDeduct}</div>}
                                  </div>
                                ) : <span style={{color:'var(--text-muted)'}}>—</span>}
                              </td>
                              {/* Check-In Address */}
                              <td style={{fontSize:'0.78rem',color:'var(--text-muted)',maxWidth:180,wordBreak:'break-word'}}>
                                {r.checkin_address || <span style={{opacity:0.4}}>—</span>}
                              </td>
                              {/* Check-Out Address */}
                              <td style={{fontSize:'0.78rem',color:'var(--text-muted)',maxWidth:180,wordBreak:'break-word'}}>
                                {r.checkout_address || <span style={{opacity:0.4}}>—</span>}
                              </td>
                              {/* Actions */}
                              <td>
                                {r.id ? <button onClick={()=>setEditAtt({...r})} style={S.btn('rgba(99,102,241,0.15)','#818cf8')}><Edit2 size={13}/> Edit</button> : '—'}
                              </td>
                            </tr>
                          );
                        })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── EMPLOYEES TAB ── */}
          {!loading && tab==='employees' && (
            <div style={S.card}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.75rem'}}>
                <div style={{position:'relative'}}>
                  <Search size={14} style={{position:'absolute',left:'0.6rem',top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
                  <input className="search-input" style={{paddingLeft:'2rem'}} placeholder="Search name, email, dept…" value={empSearch} onChange={e=>setEmpSearch(e.target.value)}/>
                </div>
                <span style={{fontSize:'0.82rem',color:'var(--text-muted)'}}>{filtEmp.length} employees</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table className="adm-table">
                  <thead><tr>
                    <th>Name</th><th>Email</th><th>Phone</th><th>Dept</th><th>Gender</th><th>Age</th><th>Salary</th><th>Joined</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {filtEmp.length===0?<tr><td colSpan={9} style={{textAlign:'center',padding:'2rem',color:'var(--text-muted)'}}>No employees found</td></tr>
                    :filtEmp.map(e=>(
                      <tr key={e.id}>
                        <td style={{fontWeight:600}}>{e.name}</td>
                        <td style={{fontSize:'0.82rem'}}>{e.email}</td>
                        <td>{e.phone||'—'}</td>
                        <td>{e.department}</td>
                        <td>{e.gender||'—'}</td>
                        <td>{e.age||'—'}</td>
                        <td>₹{e.monthly_salary?.toLocaleString()}</td>
                        <td style={{fontSize:'0.78rem'}}>{new Date(e.created_at).toLocaleDateString('en-IN')}</td>
                        <td>
                          <div style={{display:'flex',gap:'0.4rem'}}>
                            <button onClick={()=>setEditEmp({...e})} style={S.btn('rgba(99,102,241,0.15)','#818cf8')}><Edit2 size={13}/></button>
                            <button onClick={()=>setDelConfirm({type:'employee',id:e.id,name:e.name})} style={S.btn('rgba(239,68,68,0.12)','#ef4444')}><Trash2 size={13}/></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && tab==='performance' && (
            <div style={S.card}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.75rem'}}>
                <div style={{position:'relative'}}>
                  <Search size={14} style={{position:'absolute',left:'0.6rem',top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
                  <input className="search-input" style={{paddingLeft:'2rem'}} placeholder="Search employee…" value={perfSearch} onChange={e=>setPerfSearch(e.target.value)}/>
                </div>
                <span style={{fontSize:'0.82rem',color:'var(--text-muted)'}}>{filtPerf.length} records</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table className="adm-table">
                  <thead><tr>
                    <th>Employee</th><th>Department</th><th>Date</th><th>Today's Work</th><th>Clients</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {filtPerf.length===0?<tr><td colSpan={6} style={{textAlign:'center',padding:'2rem',color:'var(--text-muted)'}}>No performance records found</td></tr>
                    :filtPerf.map(p=>(
                      <tr key={p.id}>
                        <td style={{fontWeight:600}}>{p.employee_name}</td>
                        <td style={{fontSize:'0.82rem',color:'var(--text-muted)'}}>{p.department}</td>
                        <td style={{whiteSpace:'nowrap'}}>{p.date}</td>
                        <td style={{maxWidth:'280px',fontSize:'0.85rem'}}>{p.today_work}</td>
                        <td style={{textAlign:'center'}}><span style={{background:'rgba(99,102,241,0.12)',color:'#818cf8',padding:'0.2rem 0.6rem',borderRadius:'999px',fontWeight:600,fontSize:'0.8rem'}}>{p.num_clients}</span></td>
                        <td>
                          <div style={{display:'flex',gap:'0.4rem'}}>
                            <button onClick={()=>setEditPerf({...p})} style={S.btn('rgba(99,102,241,0.15)','#818cf8')}><Edit2 size={13}/></button>
                            <button onClick={()=>setDelConfirm({type:'performance',id:p.id,name:`${p.employee_name} – ${p.date}`})} style={S.btn('rgba(239,68,68,0.12)','#ef4444')}><Trash2 size={13}/></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── SALARY TAB ── */}
          {tab==='salary' && (
            <div>
              {/* Controls */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem',flexWrap:'wrap',gap:'0.75rem'}}>
                <div style={{display:'flex',alignItems:'center',gap:'0.75rem',flexWrap:'wrap'}}>
                  <input type="month" value={salaryMonth} onChange={e=>{setSalaryMonth(e.target.value);}} style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',color:'var(--text)',padding:'0.4rem 0.7rem',borderRadius:'8px',fontSize:'0.85rem'}}/>
                  <div style={{position:'relative'}}>
                    <Search size={14} style={{position:'absolute',left:'0.6rem',top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
                    <input className="search-input" style={{paddingLeft:'2rem'}} placeholder="Search employee…" value={salarySearch} onChange={e=>setSalarySearch(e.target.value)}/>
                  </div>
                  <button onClick={()=>loadSalary(salaryMonth)} style={S.btn('rgba(99,102,241,0.15)','#818cf8')}><RefreshCw size={13}/> Refresh</button>
                </div>
                <button onClick={dlSalary} style={S.btn('rgba(16,185,129,0.2)','#10b981')}><Download size={14}/> Download Excel</button>
              </div>

              {/* Summary cards */}
              {salaryData.length>0 && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
                  {[
                    {label:'Total Employees', val:salaryData.length, color:'#818cf8', icon:'👥'},
                    {label:'Total Present Days', val:salaryData.reduce((s,r)=>s+r.present_days,0), color:'#10b981', icon:'📅'},
                    {label:'Total Absent Days', val:salaryData.reduce((s,r)=>s+(r.absent_days||0),0), color:'#991b1b', icon:'🚫'},
                    {label:'Total Deductions', val:`₹${Number(salaryData.reduce((s,r)=>s+Number(r.total_deductions||0),0)).toLocaleString('en-IN')}`, color:'#ef4444', icon:'📉'},
{
  label:'Total Payroll',
  val:`₹${Math.round(salaryData.reduce((s,r)=>s+Number(r.final_salary||0),0)).toLocaleString('en-IN')}`,
  color:'#f59e0b',
  icon:'💰'
},
                  ].map(c=>(
                    <div key={c.label} className="adm-stat">
                      <div className="adm-stat-label">{c.icon} {c.label}</div>
                      <div className="adm-stat-val" style={{color:c.color}}>{c.val}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Salary table */}
              <div style={S.card}>
                {salaryLoading ? <div style={{textAlign:'center',padding:'3rem',color:'var(--text-muted)'}}>Loading salary data…</div> : (
                  <div style={{overflowX:'auto'}}>
                    <table className="adm-table">
                      <thead><tr>
                        <th style={{minWidth:140}}>Employee Name</th>
                        <th style={{minWidth:100}}>Department</th>
                        <th style={{minWidth:120}}>Total Working Days</th>
                        <th style={{minWidth:100}}>Present Days</th>
                        <th style={{minWidth:90}}>Full Days</th>
                        <th style={{minWidth:90}}>Half Days</th>
                        <th style={{minWidth:130}}>Late Check-In Count</th>
                        <th style={{minWidth:140}}>Early Check-Out Count</th>
                        <th style={{minWidth:100}}>Absent Days</th>
                        <th style={{minWidth:110}}>Total Deductions</th>
                        <th style={{minWidth:110}}>Basic Salary</th>
                        <th style={{minWidth:110}}>Final Salary</th>
                        <th style={{minWidth:120}}>Salary Status</th>
                        <th style={{minWidth:70}}>Actions</th>
                      </tr></thead>
                      <tbody>
                        {filtSalary.length===0
                          ? <tr><td colSpan={14} style={{textAlign:'center',padding:'2rem',color:'var(--text-muted)'}}>No data</td></tr>
                          : filtSalary.map(r=>(
                            <tr key={r.employee_id}>
                              <td>
                                <div style={{fontWeight:600}}>{r.employee_name}</div>
                                <div style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{r.email}</div>
                              </td>
                              <td style={{fontSize:'0.82rem'}}>{r.department}</td>
                              <td style={{textAlign:'center',fontWeight:600}}>{r.total_working_days}</td>
                              <td style={{textAlign:'center',fontWeight:700,color:'#10b981'}}>{r.present_days}</td>
                              <td style={{textAlign:'center'}}>{r.full_days}</td>
                              <td style={{textAlign:'center',color:'#eab308'}}>{r.half_days}</td>
                              <td style={{textAlign:'center',color:r.late_check_in_count>0?'#f97316':'var(--text-muted)'}}>{r.late_check_in_count}</td>
                              <td style={{textAlign:'center',color:r.early_check_out_count>0?'#3b82f6':'var(--text-muted)'}}>{r.early_check_out_count}</td>
                              <td style={{textAlign:'center',fontWeight:700,color:r.absent_days>0?'#fff':'var(--text-muted)'}}>
                                {r.absent_days>0
                                  ? <span style={{display:'inline-flex',alignItems:'center',padding:'0.2rem 0.65rem',borderRadius:'999px',fontSize:'0.75rem',fontWeight:700,background:'#ef4444',color:'#fff',border:'1px solid #ef4444'}}>{r.absent_days}</span>
                                  : '0'}
                              </td>
                              <td style={{color:r.total_deductions>0?'#ef4444':'var(--text-muted)'}}>{r.total_deductions>0?`-₹${r.total_deductions}`:'—'}</td>
                              <td>₹{r.basic_salary?.toLocaleString('en-IN')}</td>
                              <td>
                                <div style={{fontWeight:700,color:r.is_overridden?'#f59e0b':'#10b981'}}>₹{Math.round(r.final_salary).toLocaleString('en-IN')}</div>
                              </td>
                              <td>
                                <span style={{fontSize:'0.75rem',fontWeight:700,padding:'0.2rem 0.5rem',borderRadius:'6px',background:r.is_overridden?'rgba(245,158,11,0.1)':'rgba(16,185,129,0.1)',color:r.is_overridden?'#f59e0b':'#10b981'}}>
                                  {r.salary_status}
                                </span>
                              </td>
                              <td>
                                <div style={{display:'flex',gap:'0.4rem',flexWrap:'wrap'}}>
                                  <button onClick={()=>setEditSalary({...r, earned_salary: r.final_salary})} style={S.btn('rgba(99,102,241,0.15)','#818cf8')} title="Override Salary"><Edit2 size={13}/></button>
                                  {r.is_overridden && <button onClick={()=>removeSalaryOverride(r)} style={S.btn('rgba(239,68,68,0.12)','#ef4444')} title="Remove override"><RefreshCw size={13}/></button>}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Edit Salary Modal ── */}
      {editSalary && (
        <div className="modal-overlay" onClick={()=>setEditSalary(null)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <h3 style={{fontWeight:700,marginBottom:'0.5rem'}}>✏️ Edit Salary — {editSalary.employee_name}</h3>
            <div style={{fontSize:'0.82rem',color:'var(--text-muted)',marginBottom:'1rem'}}>{salaryMonth} · Base: ₹{editSalary.monthly_salary?.toLocaleString('en-IN')}</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem',marginBottom:'0.75rem',padding:'0.75rem',background:'rgba(255,255,255,0.03)',borderRadius:'8px'}}>
              {[['Present Days',editSalary.present_days],['Full Days',editSalary.full_days],['Half Days',editSalary.half_days],['Absent Days',editSalary.absent_days||0],['Late Entries',editSalary.late_entries],['Deductions',`₹${editSalary.total_deductions}`],['Auto Calc',`₹${Math.round(editSalary.calculated_salary)}`]].map(([k,v])=>(
                <div key={k}><div style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{k}</div><div style={{fontWeight:600}}>{v}</div></div>
              ))}
            </div>
            <div className="form-group">
              <label className="form-label">Final Earned Salary (₹)</label>
              <input type="number" className="form-input" value={editSalary.earned_salary||''}
                onChange={e=>setEditSalary(p=>({...p,earned_salary:e.target.value}))}/>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <input type="text" className="form-input" value={editSalary.override_notes||''}
                onChange={e=>setEditSalary(p=>({...p,override_notes:e.target.value}))} placeholder="Reason for override…"/>
            </div>
            <div style={{display:'flex',gap:'0.75rem',marginTop:'1rem'}}>
              <button onClick={saveSalaryOverride} style={{...S.btn('#4f46e5','#fff'),flex:1,justifyContent:'center',padding:'0.65rem'}}><Check size={15}/> Save Override</button>
              <button onClick={()=>setEditSalary(null)} style={{...S.btn('rgba(255,255,255,0.06)','var(--text-muted)'),padding:'0.65rem 1rem'}}><X size={15}/></button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Attendance Modal ── */}
      {editAtt && (() => {
        const totalDeduct = (Number(editAtt.deduction_amount)||0) + (Number(editAtt.checkout_deduction_amount)||0);

        const STATUS_OPTIONS = [
          { value:'Full Day',        label:'Full Day',         color:'#10b981', bg:'rgba(16,185,129,0.15)' },
          { value:'Half Day',        label:'Half Day',         color:'#eab308', bg:'rgba(234,179,8,0.15)' },
          { value:'Late Check-In',   label:'Late Check-In',    color:'#f97316', bg:'rgba(249,115,22,0.15)' },
          { value:'Early Check-Out', label:'Early Check-Out',  color:'#3b82f6', bg:'rgba(59,130,246,0.15)' },
          { value:'Absent',          label:'Absent',           color:'#ef4444', bg:'rgba(239,68,68,0.12)' },
        ];

        // Ensure we match one of the exact 5 options, fallback to Full Day
        let currentStatusVal = editAtt.status || 'Full Day';
        if (currentStatusVal === 'Present') currentStatusVal = 'Full Day';
        if (currentStatusVal === 'Late') currentStatusVal = 'Late Check-In';
        const currentStatusObj = STATUS_OPTIONS.find(o => o.value === currentStatusVal) || STATUS_OPTIONS[0];

        const selectStyle = {
          padding:'0.55rem 0.75rem', borderRadius:'8px',
          border:'1px solid var(--border)', background:'rgba(255,255,255,0.05)',
          color:'var(--text)', fontSize:'0.88rem', width:'100%', cursor:'pointer',
        };

        // Handler for status change — auto-applies deduction rules & salary_type
        const onStatusChange = (val) => {
          setEditAtt(p => {
            const updated = { ...p, status: val };
            if (val === 'Full Day') { 
              updated.salary_type = 'FULL'; updated.deduction_amount = 0; updated.checkout_deduction_amount = 0; 
            } else if (val === 'Half Day') { 
              updated.salary_type = 'HALF'; updated.deduction_amount = 0; updated.checkout_deduction_amount = 0; 
            } else if (val === 'Late Check-In') { 
              updated.salary_type = 'FULL'; updated.deduction_amount = 50; updated.checkout_deduction_amount = 0; 
            } else if (val === 'Early Check-Out') { 
              updated.salary_type = 'FULL'; updated.deduction_amount = 0; updated.checkout_deduction_amount = 50; 
            } else if (val === 'Absent') { 
              updated.salary_type = 'ABSENT'; updated.deduction_amount = 0; updated.checkout_deduction_amount = 0; 
            }
            return updated;
          });
        };

        return (
          <div className="modal-overlay" onClick={()=>setEditAtt(null)}>
            <div className="modal-box" onClick={e=>e.stopPropagation()} style={{maxWidth:500}}>
              <h3 style={{fontWeight:700,marginBottom:'0.25rem'}}>✏️ Edit Attendance</h3>
              <div style={{fontSize:'0.82rem',color:'var(--text-muted)',marginBottom:'1.25rem'}}>{editAtt.employee_name} · {editAtt.date}</div>

              {/* Times */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem',marginBottom:'1rem'}}>
                {[['Check-In Time','check_in_time'],['Check-Out Time','check_out_time']].map(([lbl,key])=>(
                  <div key={key} className="form-group" style={{margin:0}}>
                    <label className="form-label">{lbl}</label>
                    <input type="text" className="form-input" value={editAtt[key]||''} placeholder="HH:MM:SS"
                      onChange={e=>setEditAtt(p=>({...p,[key]:e.target.value}))}/>
                  </div>
                ))}
              </div>

              {/* ── Single Status Dropdown ── */}
              <div className="form-group" style={{marginBottom:'1rem'}}>
                <label className="form-label">Status</label>
                <select className="form-select" value={currentStatusVal} style={{...selectStyle, borderLeft:`3px solid ${currentStatusObj.color}`}}
                  onChange={e=>onStatusChange(e.target.value)}>
                  {STATUS_OPTIONS.map(opt=>(
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Live Preview */}
              <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'10px',padding:'0.75rem',marginBottom:'1rem',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'0.5rem',fontSize:'0.78rem'}}>
                <div>
                  <div style={{color:'var(--text-muted)',marginBottom:'0.2rem'}}>Display Status</div>
                  <span style={{fontWeight:700,color:currentStatusObj.color}}>{currentStatusObj.label}</span>
                </div>
                <div>
                  <div style={{color:'var(--text-muted)',marginBottom:'0.2rem'}}>Salary Applied</div>
                  <span style={{fontWeight:700,color:'var(--text)'}}>{editAtt.salary_type === 'ABSENT' ? 'None' : editAtt.salary_type}</span>
                </div>
                <div>
                  <div style={{color:'var(--text-muted)',marginBottom:'0.2rem'}}>Total Deduction</div>
                  <span style={{fontWeight:700,color:totalDeduct>0?'#ef4444':'#10b981'}}>{totalDeduct>0?`-₹${totalDeduct}`:'None'}</span>
                </div>
              </div>

              {/* Manual deduction overrides */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem',marginBottom:'0.75rem'}}>
                <div className="form-group" style={{margin:0}}>
                  <label className="form-label">Late Deduction (₹)</label>
                  <input type="number" min="0" className="form-input" value={editAtt.deduction_amount||0}
                    onChange={e=>setEditAtt(p=>({...p,deduction_amount:e.target.value}))}/>
                </div>
                <div className="form-group" style={{margin:0}}>
                  <label className="form-label">Checkout Deduction (₹)</label>
                  <input type="number" min="0" className="form-input" value={editAtt.checkout_deduction_amount||0}
                    onChange={e=>setEditAtt(p=>({...p,checkout_deduction_amount:e.target.value}))}/>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <input type="text" className="form-input" value={editAtt.notes||''}
                  onChange={e=>setEditAtt(p=>({...p,notes:e.target.value}))} placeholder="Reason for edit…"/>
              </div>

              <div style={{display:'flex',gap:'0.75rem',marginTop:'1.25rem'}}>
                <button onClick={saveAtt} style={{...S.btn('#4f46e5','#fff'),flex:1,justifyContent:'center',padding:'0.7rem',fontWeight:700}}>
                  <Check size={15}/> Save Changes
                </button>
                <button onClick={()=>setEditAtt(null)} style={{...S.btn('rgba(255,255,255,0.06)','var(--text-muted)'),padding:'0.7rem 1rem'}}>
                  <X size={15}/>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Edit Employee Modal ── */}
      {editEmp && (
        <div className="modal-overlay" onClick={()=>setEditEmp(null)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <h3 style={{fontWeight:700,marginBottom:'1rem'}}>✏️ Edit Employee</h3>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem'}}>
              {[['Full Name','name','text'],['Email','email','email'],['Phone','phone','tel'],['Department','department','text'],['Age','age','number'],['Salary','monthly_salary','number']].map(([lbl,key,type])=>(
                <div key={key} className="form-group" style={{margin:0}}>
                  <label className="form-label">{lbl}</label>
                  <input type={type} className="form-input" value={editEmp[key]||''} onChange={e=>setEditEmp(p=>({...p,[key]:e.target.value}))}/>
                </div>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem',marginTop:'0.75rem'}}>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Gender</label>
                <select className="form-select" value={editEmp.gender||''} onChange={e=>setEditEmp(p=>({...p,gender:e.target.value}))}>
                  <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">New Password</label>
                <input type="text" className="form-input" placeholder="Leave blank to keep" value={editEmp.password||''} onChange={e=>setEditEmp(p=>({...p,password:e.target.value}))}/>
              </div>
            </div>
            <div style={{display:'flex',gap:'0.75rem',marginTop:'1rem'}}>
              <button onClick={saveEmp} style={{...S.btn('#4f46e5','#fff'),flex:1,justifyContent:'center',padding:'0.65rem'}}><Check size={15}/> Save</button>
              <button onClick={()=>setEditEmp(null)} style={{...S.btn('rgba(255,255,255,0.06)','var(--text-muted)'),padding:'0.65rem 1rem'}}><X size={15}/></button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Performance Modal ── */}
      {editPerf && (
        <div className="modal-overlay" onClick={()=>setEditPerf(null)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <h3 style={{fontWeight:700,marginBottom:'1rem'}}>✏️ Edit Performance — {editPerf.employee_name}</h3>
            <div className="form-group">
              <label className="form-label">Today's Work</label>
              <textarea className="form-input" rows={3} value={editPerf.today_work||''} onChange={e=>setEditPerf(p=>({...p,today_work:e.target.value}))} style={{resize:'vertical'}}/>
            </div>
            <div className="form-group">
              <label className="form-label">Number of Clients</label>
              <input type="number" min="0" className="form-input" value={editPerf.num_clients||0} onChange={e=>setEditPerf(p=>({...p,num_clients:e.target.value}))}/>
            </div>
            <div style={{display:'flex',gap:'0.75rem',marginTop:'1rem'}}>
              <button onClick={savePerf} style={{...S.btn('#4f46e5','#fff'),flex:1,justifyContent:'center',padding:'0.65rem'}}><Check size={15}/> Save</button>
              <button onClick={()=>setEditPerf(null)} style={{...S.btn('rgba(255,255,255,0.06)','var(--text-muted)'),padding:'0.65rem 1rem'}}><X size={15}/></button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {delConfirm && (
        <div className="modal-overlay" onClick={()=>setDelConfirm(null)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()} style={{maxWidth:380}}>
            <div style={{display:'flex',alignItems:'center',gap:'1rem',marginBottom:'1rem'}}>
              <div style={{width:46,height:46,borderRadius:'50%',background:'rgba(239,68,68,0.15)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <Trash2 size={20} color="#ef4444"/>
              </div>
              <div>
                <div style={{fontWeight:700,marginBottom:'0.2rem'}}>Confirm Delete</div>
                <div style={{fontSize:'0.85rem',color:'var(--text-muted)'}}>Delete <strong style={{color:'var(--text)'}}>{delConfirm.name}</strong>? This cannot be undone.</div>
              </div>
            </div>
            <div style={{display:'flex',gap:'0.75rem'}}>
              <button onClick={()=>delConfirm.type==='employee'?delEmp(delConfirm.id):delPerf(delConfirm.id)} style={{...S.btn('#ef4444','#fff'),flex:1,justifyContent:'center',padding:'0.65rem'}}>Yes, Delete</button>
              <button onClick={()=>setDelConfirm(null)} style={{...S.btn('rgba(255,255,255,0.06)','var(--text-muted)'),padding:'0.65rem 1rem'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
