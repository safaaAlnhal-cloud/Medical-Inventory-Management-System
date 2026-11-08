import React from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const StorekeeperQuickActions = () => {
  const navigate = useNavigate();
  return (
    <div className="mb-6">
      <button type="button" onClick={() => navigate('/storekeeper/inventory?create=1')} className="w-full bg-[#0f4e43] hover:bg-[#135d51] text-white text-xs font-bold py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-2 shadow-sm transition cursor-pointer">
        <Plus className="w-4 h-4" />
        Add Item
      </button>
    </div>
  );
};

export default StorekeeperQuickActions;
