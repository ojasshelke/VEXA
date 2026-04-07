import { create } from 'zustand'

type UIState = {
  isAvatarViewerOpen: boolean
  isMeasurementModalOpen: boolean
  isFaceCaptureOpen: boolean
  activeTab: string
  setAvatarViewerOpen: (open: boolean) => void
  setMeasurementModalOpen: (open: boolean) => void
  setFaceCaptureOpen: (open: boolean) => void
  setActiveTab: (tab: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  isAvatarViewerOpen: false,
  isMeasurementModalOpen: false,
  isFaceCaptureOpen: false,
  activeTab: 'overview',
  setAvatarViewerOpen: (isAvatarViewerOpen) => set({ isAvatarViewerOpen }),
  setMeasurementModalOpen: (isMeasurementModalOpen) => set({ isMeasurementModalOpen }),
  setFaceCaptureOpen: (isFaceCaptureOpen) => set({ isFaceCaptureOpen }),
  setActiveTab: (activeTab) => set({ activeTab }),
}))
