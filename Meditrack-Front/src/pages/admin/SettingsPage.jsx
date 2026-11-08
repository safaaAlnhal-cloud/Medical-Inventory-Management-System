import React, { useState } from 'react';
import { ErrorState, LoadingState } from '../../components/common/DataState';
import InlineAlert from '../../components/common/InlineAlert';
import PageHeader from '../../components/common/PageHeader';
import { MIN_PASSWORD_LENGTH, ROLE_LABELS, ROLE_TITLES, USER_STATUS_LABELS } from '../../constants/users';
import { useAuth } from '../../context/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../services/apiError';
import { changePasswordApi, getProfileApi, updateProfileApi } from '../../services/profileApi';
import { getInitial } from '../../utils/formatters';

const inputClass = 'w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#115e54]';

const toFormValues = (profile) => ({ name: profile.name, email: profile.email, phone: profile.phone, currentPassword: '', newPassword: '', confirmPassword: '' });

const SettingsPage = () => {
  const { updateUser } = useAuth();

  // The service identifies the user from the session, so the page passes no user id.
  const { data: profile, loading, error, reload, setData: setProfile } = useAsyncData(getProfileApi, null);

  // Unsaved edits. While null, the form shows the saved profile.
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  if (loading) return <main className="p-4 sm:p-6 lg:p-8 flex-1"><LoadingState message="Loading settings..." /></main>;
  if (!profile) return <main className="p-4 sm:p-6 lg:p-8 flex-1"><ErrorState message={error || 'Your profile could not be loaded.'} onRetry={reload} /></main>;

  const values = draft ?? toFormValues(profile);

  const handleChange = (field, value) => {
    setDraft({ ...values, [field]: value });
    setFeedback(null);
  };

  const handleCancel = () => {
    setDraft(null);
    setFeedback(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const showError = (message) => setFeedback({ tone: 'error', message });

    const wantsPassword = Boolean(values.currentPassword || values.newPassword || values.confirmPassword);
    if (wantsPassword) {
      if (!values.currentPassword) return showError('Enter your current password to set a new one.');
      if (!values.newPassword) return showError('Enter a new password.');
      if (values.newPassword.length < MIN_PASSWORD_LENGTH) return showError(`The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      if (values.newPassword !== values.confirmPassword) return showError('New passwords do not match.');
    }

    const details = { name: values.name.trim(), email: values.email.trim(), phone: values.phone.trim() };
    if (!details.name) return showError('Full name is required.');
    const profileChanged = details.name !== profile.name || details.email !== profile.email || details.phone !== profile.phone;
    // A password-only change does not re-save an untouched profile.
    const savesProfile = profileChanged || !wantsPassword;

    setSaving(true);
    setFeedback(null);

    // The profile and the password are two separate requests, so each outcome is reported.
    if (savesProfile) {
      try {
        const updated = await updateProfileApi(details);
        setProfile(updated);
        updateUser(updated);
      } catch (err) {
        const reason = getErrorMessage(err, 'Could not save your profile. Please try again.');
        showError(wantsPassword ? `${reason} Nothing was saved, and your password was not changed.` : reason);
        setSaving(false);
        return;
      }
    }

    if (wantsPassword) {
      try {
        await changePasswordApi({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      } catch (err) {
        const reason = getErrorMessage(err, 'Could not change your password. Please try again.');
        // The password fields stay filled in so the user can correct them and try again.
        showError(savesProfile ? `Your profile was saved, but your password was not changed: ${reason}` : reason);
        setSaving(false);
        return;
      }
    }

    setDraft(null);
    const message = !wantsPassword ? 'Profile updated successfully!' : savesProfile ? 'Profile and password updated successfully!' : 'Password updated successfully!';
    setFeedback({ tone: 'success', message });
    setSaving(false);
  };

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1 max-w-7xl">
      <PageHeader title="Settings & Profile" subtitle="Manage your profile details and password." />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="card-hover lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col items-center text-center space-y-4">
          <div className="w-24 h-24 bg-[#115e54] rounded-2xl flex items-center justify-center text-white text-3xl font-extrabold shadow-sm">
            {getInitial(profile.name)}
          </div>

          <div>
            <h3 className="text-base font-extrabold text-slate-900">{profile.name}</h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">System {ROLE_TITLES[profile.role]}</p>
          </div>

          <div className="w-full pt-4 border-t border-slate-100 text-left space-y-3">
            <div>
              <span className="text-[11px] font-bold text-slate-400 block">Email</span>
              <span className="text-xs font-bold text-slate-700 break-all">{profile.email}</span>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 block">Role</span>
              <span className="text-xs font-bold text-slate-700">{ROLE_LABELS[profile.role]}</span>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 block">Status</span>
              <span className="text-xs font-bold text-slate-900">{USER_STATUS_LABELS[profile.status]}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-sm">
          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3">
                Profile Information
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Full Name *</span>
                  <input type="text" value={values.name} onChange={(e) => handleChange('name', e.target.value)} className={inputClass} required />
                </label>
                <label className="block">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Email *</span>
                  <input type="email" value={values.email} onChange={(e) => handleChange('email', e.target.value)} className={inputClass} required />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Role</span>
                  <input type="text" value={ROLE_LABELS[profile.role]} disabled className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 cursor-not-allowed" />
                </label>
                <label className="block">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Phone</span>
                  <input type="tel" placeholder="Optional" value={values.phone} onChange={(e) => handleChange('phone', e.target.value)} className={inputClass} />
                </label>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3">
                Password
              </h3>

              <label className="block">
                <span className="block text-xs font-bold text-slate-700 mb-1">Current Password</span>
                <input type="password" autoComplete="current-password" placeholder="••••••••" value={values.currentPassword} onChange={(e) => handleChange('currentPassword', e.target.value)} className={inputClass} />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs font-bold text-slate-700 mb-1">New Password</span>
                  <input type="password" autoComplete="new-password" placeholder="••••••••" value={values.newPassword} onChange={(e) => handleChange('newPassword', e.target.value)} className={inputClass} />
                </label>
                <label className="block">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Confirm New Password</span>
                  <input type="password" autoComplete="new-password" placeholder="••••••••" value={values.confirmPassword} onChange={(e) => handleChange('confirmPassword', e.target.value)} className={inputClass} />
                </label>
              </div>
            </div>

            {feedback && <InlineAlert tone={feedback.tone}>{feedback.message}</InlineAlert>}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button type="button" onClick={handleCancel} disabled={!draft || saving} className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-6 py-2.5 bg-[#115e54] hover:bg-[#0e4f47] text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
};

export default SettingsPage;
