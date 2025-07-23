import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  type User as FirebaseUser,
  onAuthStateChanged,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { notify } from '@/utils/notification'

export interface User {
  id: string
  name: string
  email: string
  photoURL: string | null
  isOnline: boolean
  lastSeen: Timestamp
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const firebaseUser = ref<FirebaseUser | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!user.value)

  // Initialize auth state listener
  function initAuth() {
    onAuthStateChanged(auth, async (fbUser) => {
      firebaseUser.value = fbUser

      if (fbUser) {
        try {
          // Get or create user document
          const userDoc = await getDoc(doc(db, 'users', fbUser.uid))

          if (!userDoc.exists()) {
            // Create new user document
            const newUser: User = {
              id: fbUser.uid,
              name: fbUser.displayName || 'Anonymous',
              email: fbUser.email || '',
              photoURL: fbUser.photoURL,
              isOnline: true,
              lastSeen: serverTimestamp() as Timestamp,
            }

            await setDoc(doc(db, 'users', fbUser.uid), newUser)
            user.value = newUser
          } else {
            // Update existing user online status
            const userData = userDoc.data() as User
            userData.isOnline = true
            userData.lastSeen = serverTimestamp() as Timestamp

            await updateDoc(doc(db, 'users', fbUser.uid), {
              isOnline: true,
              lastSeen: serverTimestamp(),
            })

            user.value = userData
          }
        } catch (error) {
          console.error('Error setting up user:', error)
        }
      } else {
        user.value = null
      }

      loading.value = false
    })
  }

  // Google Sign In
  async function signInWithGoogle() {
    try {
      loading.value = true
      error.value = null
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      notify.success('Успешный вход')
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Ошибка входа'
      notify.error(
        'Ошибка входа: ' +
          (err instanceof Error ? err.message : 'Неизвестная ошибка')
      )
    } finally {
      loading.value = false
    }
  }

  // Email/Password Sign In (для совместимости с текущим кодом)
  async function signInWithEmail(email: string, password: string) {
    try {
      loading.value = true
      error.value = null
      await signInWithEmailAndPassword(auth, email, password)
      notify.success('Успешный вход')
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Ошибка входа'
      notify.error(
        'Ошибка входа: ' +
          (err instanceof Error ? err.message : 'Неизвестная ошибка')
      )
      throw err
    } finally {
      loading.value = false
    }
  }

  // Sign Out
  async function logout() {
    try {
      // Просто выходим из Firebase Auth, не обновляя статус в Firestore
      // Статус будет обновлен через updateOnlineStatus если нужно
      await signOut(auth)
      user.value = null
      notify.info('Вы вышли из системы')
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Ошибка выхода'
      notify.error(
        'Ошибка выхода: ' +
          (err instanceof Error ? err.message : 'Неизвестная ошибка')
      )
      throw err
    }
  }

  // Update user online status
  async function updateOnlineStatus(isOnline: boolean) {
    if (user.value) {
      await updateDoc(doc(db, 'users', user.value.id), {
        isOnline,
        lastSeen: serverTimestamp(),
      })
      user.value.isOnline = isOnline
    }
  }

  return {
    user,
    firebaseUser,
    loading,
    error,
    isAuthenticated,
    initAuth,
    signInWithGoogle,
    signInWithEmail,
    logout,
    updateOnlineStatus,
  }
})
