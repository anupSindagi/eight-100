'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import DailyTasksTab from '@/components/DailyTasksTab';
import GoalsTab from '@/components/GoalsTab';

export default function Home() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'80%' | '100%'>('80%');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/signin');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Eight 100</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/tasks"
              className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Manage Tasks
            </Link>
            <button
              onClick={signOut}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-700"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('80%')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === '80%'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            80%
          </button>
          <button
            onClick={() => setActiveTab('100%')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === '100%'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            100%
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {activeTab === '80%' ? <DailyTasksTab userId={user.id} /> : <GoalsTab userId={user.id} />}
      </div>
    </div>
  );
}
