import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DashboardStats } from '@hermes/shared';

interface AppState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  dashboardStats: DashboardStats | null;
  setDashboardStats: (stats: DashboardStats) => void;

  pendingApprovalCount: number;
  setPendingApprovalCount: (count: number) => void;

  draftReadyCount: number;
  setDraftReadyCount: (count: number) => void;

  selectedProspectIds: string[];
  setSelectedProspectIds: (ids: string[]) => void;
  toggleProspectSelection: (id: string) => void;
  clearSelection: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      dashboardStats: null,
      setDashboardStats: (stats) => set({ dashboardStats: stats }),

      pendingApprovalCount: 0,
      setPendingApprovalCount: (count) => set({ pendingApprovalCount: count }),

      draftReadyCount: 0,
      setDraftReadyCount: (count) => set({ draftReadyCount: count }),

      selectedProspectIds: [],
      setSelectedProspectIds: (ids) => set({ selectedProspectIds: ids }),
      toggleProspectSelection: (id) => {
        const current = get().selectedProspectIds;
        const next = current.includes(id)
          ? current.filter((i) => i !== id)
          : [...current, id];
        set({ selectedProspectIds: next });
      },
      clearSelection: () => set({ selectedProspectIds: [] }),
    }),
    {
      name: 'hermes-app',
      partialize: (state) => ({ sidebarOpen: state.sidebarOpen }),
    },
  ),
);
