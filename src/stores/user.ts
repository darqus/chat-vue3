import { defineStore } from 'pinia'
import { ref } from 'vue'
import { auth } from '@/firebase'
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth'

interface UserState {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
}

export const useUserStore = defineStore('user', () => {
  const user = ref<UserState | null>(null)
  const error = ref<string | null>(null)
  const isLoading = ref(false)

  // Подписка на изменения состояния аутентификации
  const unsubscribe = onAuthStateChanged(
    auth,
    (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        })
      } else {
        clearUser()
      }
    }
  )

  function setUser(newUser: UserState | null) {
    user.value = newUser
    error.value = null
  }

  function clearUser() {
    user.value = null
    error.value = null
  }

  async function login(email: string, password: string) {
    try {
      isLoading.value = true
      error.value = null
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Login failed'
      throw error.value
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    try {
      isLoading.value = true
      error.value = null
      await signOut(auth)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Logout failed'
      throw error.value
    } finally {
      isLoading.value = false
    }
  }

  function isAuthenticated(): boolean {
    return !!user.value
  }

  return {
    user,
    error,
    isLoading,
    setUser,
    clearUser,
    login,
    logout,
    isAuthenticated,
    unsubscribe,
  }
})
