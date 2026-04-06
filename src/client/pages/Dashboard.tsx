import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, LogOut, Settings, Upload, Calendar, Wallet, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchApi } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../components/ui/Toast';

interface Gathering {
  id: string;
  name: string;
  currency: string;
  status: string;
  createdAt: string;
  participantCount: number;
  collaboratorCount: number;
  totalAmount: number;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { appName } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const [gatherings, setGatherings] = useState<Gathering[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newGatheringName, setNewGatheringName] = useState('');
  const [loading, setLoading] = useState(true);
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const newGathering = await fetchApi('/gatherings/import', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setGatherings([newGathering, ...gatherings]);
      navigate(`/gathering/${newGathering.id}`);
    } catch (err) {
      console.error('Import failed:', err);
      toast.error('Failed to import gathering. Please check the file format.');
    }
  };

  useEffect(() => {
    async function loadGatherings() {
      try {
        const data = await fetchApi('/gatherings');
        setGatherings(data);
      } catch (err) {
        console.error('Failed to load gatherings', err);
      } finally {
        setLoading(false);
      }
    }
    loadGatherings();
  }, []);

  const handleCreateGathering = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGatheringName.trim()) return;
    try {
      const newGathering = await fetchApi('/gatherings', {
        method: 'POST',
        body: JSON.stringify({ name: newGatheringName }),
      });
      setGatherings([newGathering, ...gatherings]);
      setIsModalOpen(false);
      setNewGatheringName('');
      navigate(`/gathering/${newGathering.id}`);
    } catch (err) {
      console.error('Failed to create gathering', err);
      toast.error('Failed to create gathering.');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const statusColor = (status: string) => {
    if (status === 'settled') return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
    if (status === 'archived') return 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400';
    return '';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary-100 dark:bg-primary-900/30 p-2 rounded-xl">
              <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{appName}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-sm text-gray-900 dark:text-gray-100 font-medium hidden sm:block">{user?.displayName}</span>
              {user?.role === 'ADMIN' && (
                <span className="text-[10px] font-bold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded uppercase tracking-wider">Admin</span>
              )}
            </div>
            {user?.role === 'ADMIN' && (
              <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
                <Settings className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Admin Portal</span>
              </Button>
            )}
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Your Gatherings</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => importFileRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Gathering
            </Button>
          </div>
          <input
            ref={importFileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
              e.target.value = '';
            }}
          />
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading gatherings...</div>
        ) : gatherings.length === 0 ? (
          <Card className="text-center py-12 border-dashed">
            <CardContent>
              <div className="mx-auto w-12 h-12 bg-primary-50 dark:bg-primary-900/20 rounded-full flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-primary-500 dark:text-primary-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No gatherings yet</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">Create your first gathering to start splitting expenses.</p>
              <Button onClick={() => setIsModalOpen(true)}>Create Gathering</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {gatherings.map((gathering) => (
              <Card
                key={gathering.id}
                className="hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => navigate(`/gathering/${gathering.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                      {gathering.name}
                    </CardTitle>
                    {gathering.status && gathering.status !== 'active' && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0 ${statusColor(gathering.status)}`}>
                        {gathering.status}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-1">
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <Wallet className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {gathering.currency || 'SGD'} {(gathering.totalAmount || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <Users className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{gathering.participantCount || 0} {gathering.participantCount === 1 ? 'person' : 'people'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{formatDate(gathering.createdAt)}</span>
                    </div>
                    {gathering.collaboratorCount > 1 && (
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <UserCheck className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{gathering.collaboratorCount} collaborators</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create New Gathering">
        <form onSubmit={handleCreateGathering} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Gathering Name</label>
            <Input
              autoFocus
              value={newGatheringName}
              onChange={(e) => setNewGatheringName(e.target.value)}
              placeholder="e.g., Weekend Trip to Tahoe"
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
