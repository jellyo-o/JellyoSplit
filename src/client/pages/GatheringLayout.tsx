import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Outlet, NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, Split, Receipt, CheckCircle, Download, Users, Copy, Check, RefreshCw, X, Crown, Shield, Eye, Lock, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { GatheringProvider } from '../context/GatheringContext';
import { useAuth } from '../context/AuthContext';
import { useGathering, type Collaborator } from '../hooks/useGathering';
import { fetchApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';

const DRAWER_DURATION = 200;

function CollaborationPanel({ gatheringId, gatheringName, ownerId, owner, collaborators, shareCode, shareCodeRole, onClose, refetch }: {
  gatheringId: string;
  gatheringName: string;
  ownerId: string;
  owner?: { id: string; displayName: string; avatarUrl?: string | null };
  collaborators: Collaborator[];
  shareCode?: string;
  shareCodeRole?: 'editor' | 'viewer';
  onClose: () => void;
  refetch: () => Promise<void>;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingShareRole, setSavingShareRole] = useState(false);
  const [closing, setClosing] = useState(false);
  const isOwner = user?.id === ownerId;
  const effectiveShareRole: 'editor' | 'viewer' = shareCodeRole === 'viewer' ? 'viewer' : 'editor';

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, DRAWER_DURATION);
  }, [onClose]);

  const shareUrl = shareCode ? `${window.location.origin}/gathering/join/${shareCode}` : '';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success('Share link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await fetchApi(`/gatherings/${gatheringId}/shareCode`, { method: 'POST' });
      await refetch();
      toast.success('Share code regenerated.');
    } catch {
      toast.error('Failed to regenerate share code.');
    } finally {
      setRegenerating(false);
      setConfirmRegen(false);
    }
  };

  const handleChangeRole = async (userId: string, newRole: 'editor' | 'viewer') => {
    try {
      await fetchApi(`/gatherings/${gatheringId}/collaborators/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });
      await refetch();
    } catch {
      toast.error('Failed to update role.');
    }
  };

  const handleRemove = async (userId: string, displayName: string) => {
    try {
      await fetchApi(`/gatherings/${gatheringId}/collaborators/${userId}`, { method: 'DELETE' });
      await refetch();
      toast.success(`${displayName} removed.`);
    } catch {
      toast.error('Failed to remove collaborator.');
    } finally {
      setConfirmRemove(null);
    }
  };

  const handleChangeShareRole = async (newRole: 'editor' | 'viewer') => {
    if (newRole === effectiveShareRole) return;
    setSavingShareRole(true);
    try {
      await fetchApi(`/gatherings/${gatheringId}/shareCodeRole`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });
      await refetch();
    } catch {
      toast.error('Failed to update share link role.');
    } finally {
      setSavingShareRole(false);
    }
  };

  const handleDeleteGathering = async () => {
    setDeleting(true);
    try {
      await fetchApi(`/gatherings/${gatheringId}`, { method: 'DELETE' });
      toast.success(`"${gatheringName}" deleted.`);
      navigate('/', { replace: true });
    } catch {
      toast.error('Failed to delete gathering.');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  // Separate owner from other collaborators
  const otherCollaborators = collaborators.filter((c) => c.userId !== ownerId);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div
        className={cn(
          'fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity',
          closing ? 'opacity-0' : 'opacity-100'
        )}
        style={{ transitionDuration: `${DRAWER_DURATION}ms` }}
        onClick={handleClose}
      />
      <div
        className={cn(
          'relative w-full max-w-md bg-white dark:bg-gray-800 shadow-xl h-full overflow-y-auto transition-transform',
          closing ? 'translate-x-full' : 'animate-[slideInRight_200ms_ease-out] translate-x-0'
        )}
        style={{ transitionDuration: `${DRAWER_DURATION}ms`, transitionTimingFunction: 'ease-in' }}
      >
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Collaboration</h2>
          <Button variant="ghost" size="sm" onClick={handleClose} className="h-8 w-8 p-0 rounded-full">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Share Link — owner only */}
          {isOwner && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Invite Link</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                {effectiveShareRole === 'editor'
                  ? 'Anyone with this link can join as an editor and collaborate in real-time.'
                  : 'Anyone with this link joins as a viewer with read-only access.'}
              </p>
              {shareCode ? (
                <>
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
                      <span className="text-sm font-mono text-gray-600 dark:text-gray-300 whitespace-nowrap select-all">
                        {shareUrl}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleCopy} className="flex-shrink-0">
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>

                  {/* Role for new joiners */}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Joins as:</span>
                    <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => handleChangeShareRole('editor')}
                        disabled={savingShareRole}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors',
                          effectiveShareRole === 'editor'
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                        )}
                      >
                        <Shield className="w-3 h-3" />
                        Editor
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChangeShareRole('viewer')}
                        disabled={savingShareRole}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors border-l border-gray-200 dark:border-gray-600',
                          effectiveShareRole === 'viewer'
                            ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                            : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                        )}
                      >
                        <Eye className="w-3 h-3" />
                        Viewer
                      </button>
                    </div>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      Existing members are not affected.
                    </span>
                  </div>

                  {/* Regenerate with inline confirm */}
                  {!confirmRegen ? (
                    <button
                      onClick={() => setConfirmRegen(true)}
                      className="flex items-center gap-1 mt-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Regenerate link
                    </button>
                  ) : (
                    <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                      <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                        The current link will stop working. Anyone who hasn't joined yet will need the new link.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleRegenerate}
                          disabled={regenerating}
                          className="text-xs h-7 bg-amber-600 hover:bg-amber-700 text-white"
                        >
                          <RefreshCw className={cn('w-3 h-3 mr-1', regenerating && 'animate-spin')} />
                          {regenerating ? 'Regenerating...' : 'Confirm'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmRegen(false)} className="text-xs h-7">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400">No share code available.</p>
              )}
            </div>
          )}

          {/* Collaborators List */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Members ({collaborators.length})
            </h3>
            <div className="space-y-2">
              {/* Owner */}
              {owner && (
                <div className="flex items-center justify-between p-3 bg-primary-50/50 dark:bg-primary-900/10 rounded-xl border border-primary-100 dark:border-primary-800/30">
                  <div className="flex items-center gap-3">
                    {owner.avatarUrl ? (
                      <img src={owner.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-800 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary-600 dark:text-primary-300">
                          {owner.displayName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {owner.displayName}
                        {user?.id === ownerId && <span className="text-xs text-gray-400 ml-1">(you)</span>}
                      </p>
                      <div className="flex items-center gap-1">
                        <Crown className="w-3 h-3 text-amber-500" />
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Owner</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Other collaborators */}
              {otherCollaborators.map((collab) => (
                <div key={collab.id}>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      {collab.user.avatarUrl ? (
                        <img src={collab.user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                          <span className="text-sm font-bold text-gray-500 dark:text-gray-300">
                            {collab.user.displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {collab.user.displayName}
                          {user?.id === collab.userId && <span className="text-xs text-gray-400 ml-1">(you)</span>}
                        </p>
                        <div className="flex items-center gap-1">
                          {collab.role === 'editor' ? (
                            <>
                              <Shield className="w-3 h-3 text-blue-500" />
                              <span className="text-xs text-blue-600 dark:text-blue-400">Editor</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3 text-gray-400" />
                              <span className="text-xs text-gray-500 dark:text-gray-400">Viewer</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {isOwner && (
                      <div className="flex items-center gap-1">
                        <select
                          value={collab.role}
                          onChange={(e) => handleChangeRole(collab.userId, e.target.value as 'editor' | 'viewer')}
                          className="text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button
                          onClick={() => setConfirmRemove(collab.userId)}
                          className="text-gray-400 hover:text-red-500 cursor-pointer p-1"
                          title="Remove"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Inline remove confirmation */}
                  {confirmRemove === collab.userId && (
                    <div className="mt-1 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <p className="text-xs text-red-700 dark:text-red-300 mb-2">
                        Remove <strong>{collab.user.displayName}</strong> from this gathering?
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleRemove(collab.userId, collab.user.displayName)}
                          className="text-xs h-7 bg-red-600 hover:bg-red-700 text-white"
                        >
                          Remove
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)} className="text-xs h-7">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {otherCollaborators.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                  {isOwner
                    ? 'No collaborators yet. Share the invite link to add people.'
                    : 'No other collaborators yet.'}
                </p>
              )}
            </div>
          </div>

          {/* Danger Zone — owner only */}
          {isOwner && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">Danger Zone</h3>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete this gathering
                </button>
              ) : (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-xs text-red-700 dark:text-red-300 mb-3">
                    This will permanently delete <strong>{gatheringName}</strong>, including all participants, expenses, payments, and collaborator access. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleDeleteGathering}
                      disabled={deleting}
                      className="text-xs h-7 bg-red-600 hover:bg-red-700 text-white"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      {deleting ? 'Deleting...' : 'Delete forever'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting} className="text-xs h-7">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GatheringLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showCollab, setShowCollab] = useState(false);

  const { gathering, setGathering, loading, error, refetch, optimistic } = useGathering(id);

  useEffect(() => {
    if (error) {
      console.error('Failed to load gathering', error);
      navigate('/');
    }
  }, [error, navigate]);

  const canEdit = useMemo(() => {
    if (!gathering || !user) return false;
    if (gathering.ownerId === user.id) return true;
    const me = gathering.collaborators.find((c) => c.userId === user.id);
    return me?.role === 'editor';
  }, [gathering, user]);

  if (loading || !gathering) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">Loading...</div>;
  }

  const navItems = [
    { path: '', label: 'Setup', icon: Settings, end: true },
    { path: 'split', label: 'Split', icon: Split, end: false },
    { path: 'payments', label: 'Payments', icon: Receipt, end: false },
    { path: 'settle', label: 'Settle', icon: CheckCircle, end: false },
    { path: 'export', label: 'Export', icon: Download, end: false },
  ];

  return (
    <GatheringProvider value={{ gathering, setGathering, optimistic, refetch, canEdit }}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mr-2 -ml-3">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{gathering.name}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Live</span>
              </div>
              {!canEdit && (
                <span
                  className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-2 py-1 rounded-full border border-amber-200 dark:border-amber-800"
                  title="You have viewer-only access to this gathering"
                >
                  <Eye className="w-3 h-3" />
                  Viewer
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCollab(true)}
                className="relative"
              >
                <Users className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Share</span>
                {gathering.collaborators && gathering.collaborators.length > 1 && (
                  <span className="ml-1 text-[10px] font-bold bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-1.5 py-0.5 rounded-full">
                    {gathering.collaborators.length}
                  </span>
                )}
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </header>

        {!canEdit && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
              <Lock className="w-4 h-4 flex-shrink-0" />
              <span>
                <span className="font-semibold">Read-only access.</span> You can view this gathering but cannot make changes. Contact the owner to request editor access.
              </span>
            </div>
          </div>
        )}

        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row gap-6">
          <aside className="md:w-64 flex-shrink-0 md:sticky md:top-[5.5rem] md:self-start">
            <nav className="flex md:flex-col space-x-2 md:space-x-0 md:space-y-1 overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center px-4 py-3 text-sm font-medium rounded-xl whitespace-nowrap transition-colors cursor-pointer',
                      isActive
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                    )
                  }
                >
                  <item.icon className={cn('w-5 h-5 mr-3 flex-shrink-0')} />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </aside>

          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
        </main>

        {showCollab && (
          <CollaborationPanel
            gatheringId={gathering.id}
            gatheringName={gathering.name}
            ownerId={gathering.ownerId}
            owner={gathering.owner}
            collaborators={gathering.collaborators}
            shareCode={gathering.shareCode}
            shareCodeRole={gathering.shareCodeRole}
            onClose={() => setShowCollab(false)}
            refetch={refetch}
          />
        )}
      </div>
    </GatheringProvider>
  );
}
