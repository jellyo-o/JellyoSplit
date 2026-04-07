import { useState, useEffect, useCallback } from 'react';
import { fetchApi, ApiError } from '../lib/api';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../components/ui/Toast';

export interface Participant {
  id: string;
  name: string;
  emoji?: string | null;
  categoryAssignments: any[];
  adjustments: any[];
}

export interface Category {
  id: string;
  name: string;
  totalAmount: number;
  sortOrder: number;
  participants: any[];
  adjustments: any[];
  sources: any[];
}

export interface Payment {
  id: string;
  categoryId?: string | null;
  participantId: string;
  paidById?: string | null;
  amount: number;
  note?: string | null;
  createdAt: string;
}

export interface Collaborator {
  id: string;
  gatheringId: string;
  userId: string;
  role: 'editor' | 'viewer';
  user: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
}

export interface GatheringState {
  id: string;
  name: string;
  description?: string | null;
  currency: string;
  status: string;
  ownerId: string;
  shareCode?: string;
  shareCodeRole?: 'editor' | 'viewer';
  owner?: { id: string; displayName: string; avatarUrl?: string | null };
  categories: Category[];
  participants: Participant[];
  payments: Payment[];
  collaborators: Collaborator[];
}

export function useGathering(id: string | undefined) {
  const [gathering, setGathering] = useState<GatheringState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const socket = useSocket();
  const toast = useToast();

  const fetchGathering = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchApi(`/gatherings/${id}`);
      setGathering(data);
      setError(null);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchGathering();
  }, [fetchGathering]);

  useEffect(() => {
    if (socket && id) {
      socket.emit('join_gathering', id);

      const handleUpdate = () => {
        fetchGathering();
      };

      socket.on('gathering:updated', handleUpdate);
      socket.on('gathering:participant:added', handleUpdate);
      socket.on('gathering:category:added', handleUpdate);
      socket.on('gathering:assignment:updated', handleUpdate);
      socket.on('gathering:payment:added', handleUpdate);
      socket.on('gathering:collaborator:added', handleUpdate);

      return () => {
        socket.emit('leave_gathering', id);
        socket.off('gathering:updated', handleUpdate);
        socket.off('gathering:participant:added', handleUpdate);
        socket.off('gathering:category:added', handleUpdate);
        socket.off('gathering:assignment:updated', handleUpdate);
        socket.off('gathering:payment:added', handleUpdate);
        socket.off('gathering:collaborator:added', handleUpdate);
      };
    }
  }, [socket, id, fetchGathering]);

  // Optimistic mutation helper: apply local change, fire API, revert on failure
  const optimistic = useCallback(
    (localUpdate: (prev: GatheringState) => GatheringState, apiCall: () => Promise<any>) => {
      if (!gathering) return;
      const prev = gathering;
      setGathering(localUpdate(prev));
      apiCall().catch((err: unknown) => {
        setGathering(prev);
        if (err instanceof ApiError && err.status === 403) {
          toast.error("You don't have permission to edit this gathering (read-only access).");
        } else if (err instanceof ApiError) {
          toast.error(err.message || 'Failed to save changes.');
        } else {
          toast.error('Failed to save changes.');
        }
      });
    },
    [gathering, toast]
  );

  return { gathering, setGathering, loading, error, refetch: fetchGathering, optimistic };
}
