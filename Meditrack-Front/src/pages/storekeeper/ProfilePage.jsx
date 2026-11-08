import React, { useState } from 'react';
import { Lock, Mail, Shield, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { ErrorState, LoadingState } from '../../components/common/DataState';
import InlineAlert from '../../components/common/InlineAlert';
import PageHeader from '../../components/common/PageHeader';
import { MIN_PASSWORD_LENGTH, ROLE_LABELS, USER_STATUS, USER_STATUS_LABELS } from '../../constants/users';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../services/apiError';
import { changePasswordApi, getProfileApi } from '../../services/profileApi';
import { getInitial } from '../../utils/formatters';

const EMPTY_PASSWORDS = { currentPassword: '', newPassword: '', confirmPassword: '' };
const passwordInputClass = 'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-emerald-600';

const ProfilePage = () => {
  // The service identifies the user from the session, so the page passes no user id.
  const { data: profile, loading, error, reload } = useAsyncData(getProfileApi, null);

  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [saving, setSaving] = useState(false);
  // { tone: 'success' | 'error', message }
  const [feedback, setFeedback] = useState(null);

  if (loading) return <main className="p-4 sm:p-6 lg:p-8 flex-1"><LoadingState message="Loading profile..." /></main>;
  if (!profile) return <main className="p-4 sm:p-6 lg:p-8 flex-1"><ErrorState message={error || 'Your profile could not be loaded.'} onRetry={reload} /></main>;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (passwords.newPassword.length < MIN_PASSWORD_LENGTH) {
      setFeedback({ tone: 'error', message: `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setFeedback({ tone: 'error', message: 'New passwords do not match.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      // `confirmPassword` is a form-only check; the service receives { currentPassword, newPassword }.
      await changePasswordApi({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
      setPasswords(EMPTY_PASSWORDS);
      setShowPasswordForm(false);
      setFeedback({ tone: 'success', message: 'Password updated successfully!' });
    } catch (err) {
      setFeedback({ tone: 'error', message: getErrorMessage(err, 'Failed to update password.') });
    } finally {
      setSaving(false);
    }
  };

  const togglePasswordForm = () => {
    setShowPasswordForm(!showPasswordForm);
    setFeedback(null);
  };

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1 max-w-4xl">
      <PageHeader bold title="Storekeeper Profile" subtitle="Manage your account information and security settings." />

      <div className="card-hover bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
        <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-2xl font-bold font-noto-serif shrink-0">
            {getInitial(profile.name)}
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900">{profile.name}</h3>
            <p className="text-xs text-slate-400 font-semibold flex items-center gap-1 mt-0.5">
              <Shield className="w-3.5 h-3.5 text-emerald-600" /> {ROLE_LABELS[profile.role]}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Email Address</span>
            <div className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" /> <span className="break-all">{profile.email}</span>
            </div>
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Account Status</span>
            <div className={`flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold ${profile.status === USER_STATUS.ACTIVE ? 'text-emerald-600' : 'text-rose-600'}`}>
              <CheckCircle2 className="w-4 h-4" /> {USER_STATUS_LABELS[profile.status]}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500 font-semibold">Want to secure your account?</span>
          <button
            type="button"
            onClick={togglePasswordForm}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            {showPasswordForm ? 'Hide Password Form' : 'Change Password'}
            {showPasswordForm ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Shown outside the form so the success message stays visible after the form closes. */}
      {feedback && !showPasswordForm && <InlineAlert tone={feedback.tone}>{feedback.message}</InlineAlert>}

      {showPasswordForm && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm transition-all duration-300">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-slate-600" />
            <h3 className="text-base font-bold text-slate-900 font-noto-serif">Change Password</h3>
          </div>

          {feedback && <div className="mb-4"><InlineAlert tone={feedback.tone}>{feedback.message}</InlineAlert></div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-xs font-bold text-slate-700 block mb-1">Current Password</span>
              <input type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} className={passwordInputClass} placeholder="••••••••" required />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-bold text-slate-700 block mb-1">New Password</span>
                <input type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} className={passwordInputClass} placeholder="••••••••" required />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-700 block mb-1">Confirm New Password</span>
                <input type="password" autoComplete="new-password" value={passwords.confirmPassword} onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })} className={passwordInputClass} placeholder="••••••••" required />
              </label>
            </div>

            <div className="pt-2 flex justify-end">
              <button type="submit" disabled={saving} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm disabled:opacity-50">
                {saving ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
};

export default ProfilePage;
