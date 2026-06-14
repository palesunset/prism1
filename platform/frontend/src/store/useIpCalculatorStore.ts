import { create } from 'zustand';

type IpCalculatorState = {
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
};

export const useIpCalculatorStore = create<IpCalculatorState>((set, get) => ({
  panelOpen: false,
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set({ panelOpen: !get().panelOpen }),
}));
