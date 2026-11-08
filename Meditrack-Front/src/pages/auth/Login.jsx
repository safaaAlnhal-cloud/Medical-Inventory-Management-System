import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getHomePath } from '../../constants/users';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../services/apiError';
import { loginApi } from '../../services/authApi';
import { hasSessionExpired } from '../../services/authStorage';
import bgImage from '../../assets/Gemini_Generated_Image_hnwdqbhnwdqbhnwd.jfif';

const SESSION_ENDED_NOTICE = 'Your session has ended. Please sign in again.';
// There is no self-service reset: nothing is emailed. An administrator sets a new password
// from the Users page (Edit User), which is what this message tells the user to ask for.
const PASSWORD_RESET_NOTICE = 'Passwords cannot be reset from this page. Ask your administrator to set a new password for your account.';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, role } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '', rememberMe: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Information that is not an error: why the user is back here, or how passwords are reset.
  const [notice, setNotice] = useState(() => (hasSessionExpired() ? SESSION_ENDED_NOTICE : ''));

  // Already signed in: go straight to the user's dashboard.
  if (isAuthenticated) return <Navigate to={getHomePath(role)} replace />;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      const session = await loginApi({ email: formData.email, password: formData.password });
      login(session, { remember: formData.rememberMe });

      // Return to the page the user was sent here from, but only if their role can open it.
      const requestedPath = location.state?.from?.pathname;
      const canOpenRequested = requestedPath?.startsWith(`/${session.user.role}/`);
      navigate(canOpenRequested ? requestedPath : getHomePath(session.user.role), { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to sign in. Please try again.'));
      setLoading(false);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden text-slate-800 font-['Nunito',sans-serif] antialiased m-0 p-0">
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url("${bgImage}")` }}
      >
        <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" />
      </div>

      <div className="fixed inset-0 overflow-y-auto z-10 pointer-events-auto">
        <div className="min-h-full flex items-center justify-center p-4">
          <div className="w-full max-w-[370px] bg-white/95 border border-slate-200/90 rounded-2xl shadow-2xl p-6 backdrop-blur-md">

            <div className="text-center mb-6 flex flex-col items-center justify-center">
              <div className="inline-flex items-center gap-2 mb-1.5 -ml-4">
                <div
                  aria-hidden="true"
                  className="w-8 h-8 rounded-lg bg-[#0f4e43] flex items-center justify-center text-white shadow-sm flex-shrink-0"
                >
                  <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                    <path d="M19 6h-3V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H5a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3Zm-9-2h4v2h-4V4Zm6 9h-3v3a1 1 0 0 1-2 0v-3H8a1 1 0 0 1 0-2h3V8a1 1 0 0 1 2 0v3h3a1 1 0 0 1 0 2Z"></path>
                  </svg>
                </div>
                <span className="text-2xl font-bold text-[#0f172a] tracking-tight font-noto-serif">
                  MediTrack
                </span>
              </div>

              <h3 className="text-2xl font-bold text-[#0f172a] tracking-tight mb-1 font-noto-serif">
                Welcome Back
              </h3>
              <p className="text-xs text-slate-500 font-semibold font-nunito">
                Sign in to continue to your account
              </p>
            </div>

            {error && (
              <div role="alert" className="mb-4 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-bold text-center font-nunito">
                {error}
              </div>
            )}

            {notice && !error && (
              <div role="status" className="mb-4 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold text-center font-nunito">
                {notice}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 font-nunito">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 font-nunito" htmlFor="email">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full px-3.5 py-2.5 text-slate-700 bg-white border border-slate-300 rounded-lg text-xs font-semibold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e6255]/20 focus:border-[#0e6255] transition font-nunito"
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="Enter your email address"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5 font-nunito" htmlFor="password">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full px-3.5 py-2.5 text-slate-700 bg-white border border-slate-300 rounded-lg text-xs font-semibold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0e6255]/20 focus:border-[#0e6255] transition font-nunito"
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-0.5 font-semibold font-nunito">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    className="w-3.5 h-3.5 rounded text-[#0e6255] border-slate-300 focus:ring-[#0e6255]"
                    id="remember_me"
                    name="rememberMe"
                    type="checkbox"
                    checked={formData.rememberMe}
                    onChange={handleChange}
                  />
                  <span className="text-slate-600 font-nunito">Remember me</span>
                </label>
                <button
                  type="button"
                  className="font-bold text-[#115349] hover:text-[#0f4840] transition hover:underline font-nunito cursor-pointer"
                  onClick={() => {
                    setError('');
                    setNotice(PASSWORD_RESET_NOTICE);
                  }}
                >
                  Forgot Password?
                </button>
              </div>

              <div className="pt-1">
                <button
                  className="w-full py-2.5 px-4 bg-[#115e54] hover:bg-[#0e4f47] active:bg-[#0b3e38] text-white font-bold text-xs rounded-lg transition duration-150 shadow-sm flex items-center justify-center cursor-pointer disabled:opacity-50 font-nunito"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? 'Logging in...' : 'Login'}
                </button>
              </div>

              <div className="pt-2 text-center">
                <p className="text-[11px] text-slate-400 font-semibold font-nunito">
                  Access for authorized medical center staff only.
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
