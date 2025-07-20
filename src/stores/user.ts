import { defineStore } from 'pinia';
import { ref } from 'vue';

interface UserState {
  uid: string;
  displayName: string | null;
  email: string | null;
}

export const useUserStore = defineStore('user', () => {
  const user = ref<UserState | null>(null);

  function setUser(newUser: UserState | null) {
    user.value = newUser;
  }

  function clearUser() {
    user.value = null;
  }

  return { user, setUser, clearUser };
});
