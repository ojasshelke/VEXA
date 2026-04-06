'use client'
import { useAvatarStore } from '@/store/avatarStore'

export function useAvatar(userId: string | undefined) {
  const { avatar, status, glbUrl, setAvatar, setStatus } = useAvatarStore()
  // TODO: poll /api/avatar/[userId] until status === 'ready'
  return { avatar, status, glbUrl, isLoading: status === 'processing' || status === 'queued' }
}
