import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';

export default function JoinGathering() {
  const { shareCode } = useParams<{ shareCode: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!shareCode) return;

    async function join() {
      try {
        const gathering = await fetchApi(`/gatherings/join/${shareCode}`, { method: 'POST' });
        toast.success(`Joined "${gathering.name}"!`);
        navigate(`/gathering/${gathering.id}`, { replace: true });
      } catch (err: any) {
        setError(err.message || 'Failed to join gathering');
      }
    }

    join();
  }, [shareCode, navigate, toast]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 max-w-md w-full text-center">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Unable to Join</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline cursor-pointer"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
      Joining gathering...
    </div>
  );
}
