import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { UserPlus } from 'lucide-react';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    birth_date: '',
    age: '',
    gender: '',
    department: '',
    monthly_salary: '',
    email: '',
    password: '',
    education: '',
    address: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'birth_date') {
      const today = new Date();
      const birth = new Date(value);
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
      setFormData((prev) => ({ ...prev, birth_date: value, age: age > 0 ? age : '' }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(formData);
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page" style={{ minHeight: '100vh', overflowY: 'auto', padding: '2rem 0' }}>
      <div className="auth-container" style={{ maxWidth: '560px', margin: '0 auto', padding: '0 1rem' }}>
        <div className="glass-card" style={{ padding: '2rem' }}>
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Join the organization</p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Full Name */}
            <div className="form-group">
              <label className="form-label">Full Name <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="text"
                name="name"
                className="form-input"
                value={formData.name}
                onChange={handleChange}
                //placeholder="John Doe"
                required
              />
            </div>

            {/* Phone + Gender */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Phone Number <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="tel"
                  name="phone"
                  className="form-input"
                  value={formData.phone}
                  onChange={handleChange}
                  //placeholder="+91 9876543210"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Gender <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select name="gender" className="form-select" value={formData.gender} onChange={handleChange} required>
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
            </div>

            {/* Birth Date + Age */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Birth Date <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="date"
                  name="birth_date"
                  className="form-input"
                  value={formData.birth_date}
                  onChange={handleChange}
                  max={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Age (Auto-Calculated)</label>
                <input
                  type="number"
                  name="age"
                  className="form-input"
                  value={formData.age}
                  readOnly
                  placeholder="Auto"
                  style={{ background: 'rgba(255,255,255,0.05)', cursor: 'not-allowed' }}
                />
              </div>
            </div>

            {/* Department — text input */}
            <div className="form-group">
              <label className="form-label">Department <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="text"
                name="department"
                className="form-input"
                value={formData.department}
                onChange={handleChange}
                //placeholder="e.g. Engineering, HR, Sales…"
                required
              />
            </div>

            {/* Education + Address */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Education <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  name="education"
                  className="form-input"
                  value={formData.education}
                  onChange={handleChange}
                  // placeholder="e.g. B.Tech, MBA…"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Address <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  type="text"
                  name="address"
                  className="form-input"
                  value={formData.address}
                  onChange={handleChange}
                  // placeholder="e.g. 123 Main St, City"
                  required
                />
              </div>
            </div>

            {/* Salary */}
            <div className="form-group">
              <label className="form-label">Monthly Salary (₹) <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="number"
                name="monthly_salary"
                className="form-input"
                value={formData.monthly_salary}
                onChange={handleChange}
                // placeholder="e.g. 30000"
                min="1"
                required
              />
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label">Email Address <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="email"
                name="email"
                className="form-input"
                value={formData.email}
                onChange={handleChange}
                //placeholder="john@company.com"
                required
              />
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label">Password <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                type="password"
                name="password"
                className="form-input"
                value={formData.password}
                onChange={handleChange}
                placeholder="Create a strong password (min 6 chars)"
                required
                minLength={6}
              />
            </div>

            {error && <p className="error-text">{error}</p>}

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '0.5rem' }}>
              {loading ? 'Creating Account...' : <><UserPlus size={18} /> Register</>}
            </button>
          </form>

          <div className="text-center mt-4" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Already have an account? <Link to="/login" className="link">Sign in here</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
