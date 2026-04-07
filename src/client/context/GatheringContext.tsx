import { createContext, useContext } from 'react';
import { GatheringState } from '../hooks/useGathering';

interface GatheringContextType {
  gathering: GatheringState;
  setGathering: React.Dispatch<React.SetStateAction<GatheringState | null>>;
  optimistic: (
    localUpdate: (prev: GatheringState) => GatheringState,
    apiCall: () => Promise<any>
  ) => void;
  refetch: () => Promise<void>;
  canEdit: boolean;
}

const GatheringContext = createContext<GatheringContextType | null>(null);

export const GatheringProvider = GatheringContext.Provider;

export function useGatheringContext() {
  const ctx = useContext(GatheringContext);
  if (!ctx) throw new Error('useGatheringContext must be used inside GatheringProvider');
  return ctx;
}
