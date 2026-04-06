import { useEffect, useState } from 'react';
import { User, Shield, ShieldAlert } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { useToast } from '../components/ui/Toast';

interface UserData {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: 'ADMIN' | 'USER';
  createdAt: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserData[]>([]);
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadUsers() {
      try {
        const data = await fetchApi('/users');
        setUsers(data.users);
      } catch (err: any) {
        setError(err.message || 'Failed to load users');
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, []);

  const toggleRole = async (user: UserData) => {
    const newRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
    try {
      await fetchApi(`/users/${user.id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });
      setUsers(users.map(u => u.id === user.id ? { ...u, role: newRole } : u));
      toast.success(`${user.displayName} is now ${newRole}.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update role');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Manage Users</h2>

      {error && <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading users...</div>
      ) : (
        <div className="space-y-4">
          {users.map((u) => (
            <Card key={u.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{u.displayName}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{u.username || u.email}</p>
                  </div>
                  {u.role === 'ADMIN' && (
                    <span className="text-[10px] font-bold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      Admin
                    </span>
                  )}
                </div>
                <Button
                  variant={u.role === 'ADMIN' ? 'outline' : 'primary'}
                  size="sm"
                  onClick={() => toggleRole(u)}
                >
                  {u.role === 'ADMIN' ? (
                    <>
                      <ShieldAlert className="w-4 h-4 mr-2" />
                      Demote to User
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4 mr-2" />
                      Promote to Admin
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
