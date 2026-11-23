import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ACCOUNT_WARNING_DAYS, USER_STATUS } from '../../constants/users';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getProfileApi } from '../../services/profileApi';
import { daysUntil } from '../../utils/dates';
import { formatDate } from '../../utils/formatters';

// The warning a storekeeper sees while their active account has 0-7 days left, in the same
// window as the account alerts (BACKEND_HANDOFF.md 4.2). Only the admin can move the date:
// there is no extension request in the system, so the message says who to ask.
const expiryWarning = (profile) => {
  if (!profile || profile.status !== USER_STATUS.ACTIVE || !profile.accountExpiresOn) return null;
  const daysLeft = daysUntil(profile.accountExpiresOn);
  if (daysLeft === null || daysLeft < 0 || daysLeft > ACCOUNT_WARNING_DAYS) return null;
  const date = formatDate(profile.accountExpiresOn);
  return daysLeft === 0
    ? `Your account expires today (${date}). From tomorrow you will not be able to sign in.`
    : `Your account expires in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}, on ${date}. After that date you will not be able to sign in.`;
};

// The red box, for a profile the page already has (the Profile page). Nothing when no warning applies.
export const AccountExpiryWarning = ({ profile }) => {
  const warning = expiryWarning(profile);
  if (!warning) return null;
  return (
    <div role="alert" className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700">
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm font-bold">{warning}</p>
        <p className="text-xs font-semibold text-red-600">Please contact the administrator to extend your account.</p>
      </div>
    </div>
  );
};

// The same box on a page that does not load the profile (the dashboard): it reads the signed-in
// user's own profile (GET /profile), because the session only holds the name, email and role.
// If that request fails, the page shows nothing here rather than an error of its own.
export const MyAccountExpiryWarning = () => {
  const { data: profile } = useAsyncData(getProfileApi, null);
  return <AccountExpiryWarning profile={profile} />;
};
