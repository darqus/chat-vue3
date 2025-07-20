import { defineStore } from 'pinia'
import { ref } from 'vue'
import { auth } from '@/firebase'
import { GoogleAuthProvider, signInWithPopup, signOut, type User } from 'firebase/auth'

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const isLoggedIn = ref(false)

  auth.onAuthStateChanged((account) => {
    if (account) {
      user.value = account
      isLoggedIn.value = true
    } else {
      user.value = null
      isLoggedIn.value = false
    }
  })

  const login = async () => {
    const provider = new GoogleAuthProvider()
    try {
      await signInWithPopup(auth, provider)
    } catch (error) {
      console.error(error)
    }
  }

  const logout = async () => {
    try {
      await signOut(auth)
    } catch (error) {
      console.error(error)
    }
  }

  return { user, isLoggedIn, login, logout }
})
