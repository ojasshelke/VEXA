'use client'
import { useEffect } from 'react'
import { useAvatarStore } from '@/store/avatarStore'
import { supabase } from '@/lib/supabase'

export function useAvatar(userId: string | undefined) {
  const { avatar, status, glbUrl, setAvatar, setStatus } = useAvatarStore()

  useEffect(() => {
    if (!userId) return
    // If already ready with a URL, don't re-poll
    if (status === 'ready' && glbUrl) return
    let cancelled = false
    let attempts = 0

    const poll = async () => {
      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession()

      while (!cancelled && attempts < 60) {
        await new Promise(r => setTimeout(r, 3000))
        attempts++
        try {
          console.log('[useAvatar] Polling avatar for:', userId, 'attempt:', attempts)
          const res = await fetch(`/api/avatar/${userId}`, {
            headers: {
              'Authorization': `Bearer ${session?.access_token ?? ''}`,
            },
          })
          if (!res.ok) continue
          const data = await res.json()
          console.log('[useAvatar] Poll result:', data.status, data.glb_url)
          if (data.status === 'ready') {
            setAvatar(data)
            return
          }
          if (data.status === 'error') {
            setStatus('error')
            return
          }
        } catch (err) {
          console.error('[useAvatar] Avatar polling error:', err)
        }
      }
    }

    // Start polling immediately for any status that isn't ready
    if (status !== 'ready') {
      poll()
    }

    return () => { cancelled = true }
  }, [userId, status, glbUrl, setAvatar, setStatus])

  return { avatar, status, glbUrl, isLoading: status === 'processing' || status === 'queued' }
}
