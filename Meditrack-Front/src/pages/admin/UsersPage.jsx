import React, { useCallback, useState } from 'react';
import { UserPlus, ShieldCheck, Mail, CheckCircle2, Activity, Package } from 'lucide-react';
import { ACTION_BUTTON_TONE, EditIcon, ViewIcon } from '../../components/common/ActionIcons';
import { TableState } from '../../components/common/DataState';
import FormField, { inputClassName } from '../../components/common/FormField';
import InlineAlert from '../../components/common/InlineAlert';
import Modal from '../../components/common/Modal';
import PageHeader from '../../components/common/PageHeader';
import { MIN_PASSWORD_LENGTH, ROLE_LABELS, USER_STATUS, USER_STATUS_LABELS } from '../../constants/users';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useCreateParam } from '../../hooks/useCreateParam';
import { useSearchQuery } from '../../hooks/useSearchQuery';
import { getErrorMessage, getFieldErrors } from '../../services/apiError';
import { createUserApi, getUsersApi, resetUserPasswordApi, updateUserApi } from '../../services/usersApi';
import { formatDateTime, formatNumber, getInitial } from '../../utils/formatters';
import { sameId } from '../../utils/ids';

const EMPTY_LIST = [];
const NO_ERRORS = {};
const EMPTY_ADD_FORM = { name: '', email: '', password: '' };

const UsersPage = () => {
  const { user, updateUser } = useAuth();
  const currentUserId = user?.id;
  const search = useSearchQuery();
  const { showSuccess } = useToast();

  const loadUsers = useCallback(() => getUsersApi({ search }), [search]);
  const { data: users, loading, error, reload } = useAsyncData(loadUsers, EMPTY_LIST);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);

  const [viewingUser, setViewingUser] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  // `newPassword` is optional: left empty, the user's password is not touched.
  const [editForm, setEditForm] = useState({ name: '', email: '', status: USER_STATUS.ACTIVE, newPassword: '' });

  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState(NO_ERRORS);
  const [saving, setSaving] = useState(false);

  const clearErrors = () => {
    setFormError('');
    setFieldErrors(NO_ERRORS);
  };

  // A message that already sits under its field is not repeated above the form.
  const showSaveError = (err, fallback, prefix = '') => {
    const errors = getFieldErrors(err);
    setFieldErrors(errors);
    setFormError(Object.keys(errors).length && !prefix ? '' : `${prefix}${getErrorMessage(err, fallback)}`);
  };

  // The add form always opens empty: nothing typed into a form that was closed is kept.
  const openAddModal = useCallback(() => {
    setAddForm(EMPTY_ADD_FORM);
    setFormError('');
    setFieldErrors(NO_ERRORS);
    setIsAddModalOpen(true);
  }, []);

  useCreateParam(openAddModal);

  const openEditModal = (user) => {
    setEditForm({ name: user.name, email: user.email, status: user.status, newPassword: '' });
    clearErrors();
    setEditingUser(user);
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setSaving(true);
    clearErrors();
    try {
      await createUserApi({ name: addForm.name.trim(), email: addForm.email.trim(), password: addForm.password });
      setIsAddModalOpen(false);
      showSuccess('Storekeeper account created.');
      reload();
    } catch (err) {
      showSaveError(err, 'Could not create the account. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // The details and the password are two separate requests, so each outcome is reported:
  // success is only announced for what was actually saved.
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const wantsPassword = editForm.newPassword !== '';
    setSaving(true);
    clearErrors();

    try {
      const updated = await updateUserApi(editingUser.id, { name: editForm.name.trim(), email: editForm.email.trim(), status: editForm.status });
      if (sameId(updated.id, currentUserId)) updateUser(updated);
      reload();
    } catch (err) {
      showSaveError(err, 'Could not update the user. Please try again.', wantsPassword ? 'Nothing was saved, and the password was not changed: ' : '');
      setSaving(false);
      return;
    }

    if (wantsPassword) {
      try {
        await resetUserPasswordApi(editingUser.id, { newPassword: editForm.newPassword });
      } catch (err) {
        showSaveError(err, 'Could not set the new password. Please try again.', 'The user details were saved, but the password was not changed: ');
        setSaving(false);
        return;
      }
    }

    setEditingUser(null);
    showSuccess(wantsPassword ? 'User updated and new password set.' : 'User updated successfully.');
    setSaving(false);
  };

  const statusTextClass = (status) => (status === USER_STATUS.ACTIVE ? 'text-emerald-700' : 'text-rose-700');

  return (
    <>
      <main className="p-4 sm:p-6 lg:p-8 space-y-6 flex-1">
        <PageHeader
          title="Users Management"
          subtitle="Manage storekeepers and system access."
          actions={(
            <button type="button" onClick={openAddModal} className="px-4 py-2.5 bg-[#115e54] hover:bg-[#0e4f47] text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition cursor-pointer">
              <UserPlus className="w-4 h-4" /> Add StoreKeeper
            </button>
          )}
        />

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[540px] md:min-w-[650px]">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="py-3.5 px-3 md:px-6">Name</th>
                  <th className="py-3.5 px-3 md:px-6">Email</th>
                  <th className="py-3.5 px-3 md:px-6">Role</th>
                  <th className="py-3.5 px-3 md:px-6">Status</th>
                  <th className="py-3.5 px-3 md:px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                <TableState colSpan={5} loading={loading} error={error} onRetry={reload} empty={users.length === 0} loadingMessage="Loading users..." emptyMessage="No users found.">
                  {users.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-4 px-3 md:px-6 font-bold text-slate-900">{row.name}</td>
                      <td className="py-4 px-3 md:px-6 text-slate-600">{row.email}</td>
                      <td className="py-4 px-3 md:px-6 text-slate-700 font-semibold">{ROLE_LABELS[row.role]}</td>
                      <td className="py-4 px-3 md:px-6">
                        <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${row.status === USER_STATUS.ACTIVE ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          {USER_STATUS_LABELS[row.status]}
                        </span>
                      </td>
                      <td className="py-4 px-3 md:px-6">
                        <div className="flex items-center justify-center gap-3">
                          <button type="button" onClick={() => setViewingUser(row)} title="View Details" aria-label={`View ${row.name}`} className={`p-1.5 bg-slate-50 ${ACTION_BUTTON_TONE} rounded-lg transition cursor-pointer`}>
                            <ViewIcon />
                          </button>
                          <button type="button" onClick={() => openEditModal(row)} title="Edit User" aria-label={`Edit ${row.name}`} className={`p-1.5 bg-slate-50 ${ACTION_BUTTON_TONE} rounded-lg transition cursor-pointer`}>
                            <EditIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </TableState>
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {isAddModalOpen && (
        <Modal title="Add New StoreKeeper" onClose={() => setIsAddModalOpen(false)}>
          <form onSubmit={handleAddUser} className="space-y-4">
            {formError && <InlineAlert>{formError}</InlineAlert>}
            <FormField label="Full Name" error={fieldErrors.name}>
              <input type="text" required placeholder="e.g. Ahmad Khaled" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} className={inputClassName} />
            </FormField>
            <FormField label="Email Address" error={fieldErrors.email}>
              <input type="email" required placeholder="e.g. ahmad@medcenter.ps" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} className={inputClassName} />
            </FormField>
            <FormField label={`Password (min. ${MIN_PASSWORD_LENGTH} characters)`} error={fieldErrors.password}>
              <input type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" placeholder="••••••••" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} className={inputClassName} />
            </FormField>
            <div className="pt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[#115e54] hover:bg-[#0e4f47] text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50">
                Add StoreKeeper
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewingUser && (
        <Modal title="User Profile Details" titleClassName="text-base font-extrabold text-[#115e54] font-noto-serif" onClose={() => setViewingUser(null)}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="w-12 h-12 bg-[#115e54]/10 rounded-full flex items-center justify-center text-[#115e54] font-extrabold text-lg shrink-0">
                {getInitial(viewingUser.name)}
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-slate-900 text-sm">{viewingUser.name}</h4>
                <p className="text-xs text-slate-500">{ROLE_LABELS[viewingUser.role]}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs font-semibold">
              <div className="flex justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 flex items-center gap-1.5"><Mail className="w-4 h-4" /> Email:</span>
                <span className="text-slate-700 break-all text-right">{viewingUser.email}</span>
              </div>
              <div className="flex justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Role:</span>
                <span className="text-slate-700">{ROLE_LABELS[viewingUser.role]}</span>
              </div>
              <div className="flex justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Status:</span>
                <span className={`${statusTextClass(viewingUser.status)} font-bold`}>{USER_STATUS_LABELS[viewingUser.status]}</span>
              </div>
              <div className="flex justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 flex items-center gap-1.5"><Activity className="w-4 h-4" /> Last Activity:</span>
                <span className="text-slate-700">{viewingUser.lastActiveAt ? formatDateTime(viewingUser.lastActiveAt) : 'Never'}</span>
              </div>
              <div className="flex justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                <span className="text-slate-400 flex items-center gap-1.5"><Package className="w-4 h-4" /> Transactions Handled:</span>
                <span className="text-slate-700 font-bold">{formatNumber(viewingUser.transactionsCount)} actions</span>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button type="button" onClick={() => setViewingUser(null)} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer">
              Close
            </button>
          </div>
        </Modal>
      )}

      {editingUser && (
        <Modal title={`Edit User: ${editingUser.name}`} onClose={() => setEditingUser(null)}>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            {formError && <InlineAlert>{formError}</InlineAlert>}
            <FormField label="Full Name" error={fieldErrors.name}>
              <input type="text" required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputClassName} />
            </FormField>
            <FormField label="Email Address" error={fieldErrors.email}>
              <input type="email" required value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={inputClassName} />
            </FormField>
            <FormField label="Account Status" error={fieldErrors.status}>
              {/* An admin cannot deactivate the account they are signed in with. */}
              <select value={editForm.status} disabled={sameId(editingUser.id, currentUserId)} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className={`${inputClassName} disabled:opacity-60 disabled:cursor-not-allowed`}>
                <option value={USER_STATUS.ACTIVE}>{USER_STATUS_LABELS.active}</option>
                <option value={USER_STATUS.INACTIVE}>{USER_STATUS_LABELS.inactive}</option>
              </select>
            </FormField>
            {/* How a forgotten password is recovered: an admin sets a new one here. Admins change
                their own password in Settings, where the current password is required. */}
            {!sameId(editingUser.id, currentUserId) && (
              <FormField label={`Set New Password (optional, min. ${MIN_PASSWORD_LENGTH} characters)`} error={fieldErrors.newPassword}>
                <input type="password" minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" placeholder="Leave empty to keep the current password" value={editForm.newPassword} onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })} className={inputClassName} />
              </FormField>
            )}

            <div className="pt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[#115e54] hover:bg-[#0e4f47] text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50">
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
};

export default UsersPage;
