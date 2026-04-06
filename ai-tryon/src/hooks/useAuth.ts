'use client'
import { useAuthStore } from '@/store/authStore'

export function useAuth() {
  const { user, isLoading, isAuthenticated, logout } = useAuthStore()
  // TODO: subscribe to Supabase auth state changes
  return { user, isLoading, isAuthenticated, logout }
}
