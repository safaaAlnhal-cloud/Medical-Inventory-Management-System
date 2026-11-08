import React from 'react';
import { useNavigate } from 'react-router-dom';

const AdminQuickActions = () => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/admin/users?create=1')} className="w-full mb-6 py-2.5 px-4 bg-[#115e54] hover:bg-[#0e4f47] text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition cursor-pointer">
      <span className="text-sm font-bold">+</span>
      Add StoreKeeper
    </button>
  );
};

export default AdminQuickActions;
