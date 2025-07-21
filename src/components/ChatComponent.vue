<script setup lang="ts">
defineOptions({
  name: 'ChatComponent',
});

import { ref, onMounted, onUnmounted } from 'vue';
import { db } from '@/firebase';
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  serverTimestamp,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();

interface Message {
  id: string;
  text: string;
  uid: string;
  displayName: string;
  createdAt: Timestamp | null;
}

const messages = ref<Message[]>([]);
const newMessage = ref('');

const messagesCollection = collection(db, 'messages');
const q = query(messagesCollection, orderBy('createdAt', 'asc'));

let unsubscribe: () => void;

onMounted(() => {
  unsubscribe = onSnapshot(q, (snapshot) => {
    messages.value = snapshot.docs.map((doc) => ({
      id: doc.id,
      text: doc.data().text,
      uid: doc.data().uid,
      displayName: doc.data().displayName,
      createdAt: doc.data().createdAt,
    }));
  });
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
});

const sendMessage = async () => {
  if (newMessage.value.trim() && userStore.user) {
    await addDoc(messagesCollection, {
      text: newMessage.value,
      uid: userStore.user.uid,
      displayName: userStore.user.displayName || 'Anonymous',
      createdAt: serverTimestamp(),
    });
    newMessage.value = '';
  }
};

const formatTimestamp = (timestamp: Timestamp | null): string => {
  if (!timestamp) return 'Sending...';
  return new Date(timestamp.toDate()).toLocaleTimeString();
};
</script>

<template>
  <v-container class="fill-height">
    <v-row class="h-100">
      <v-col class="d-flex flex-column">
        <div v-if="userStore.user" class="chat-container d-flex flex-column">
          <div class="messages-list flex-grow-1">
            <div
              v-for="message in messages"
              :key="message.id"
              class="message"
              :class="{ 'my-message': message.uid === userStore.user.uid }"
            >
              <div class="message-content">
                <div class="font-weight-bold">{{ message.displayName }}</div>
                <div>{{ message.text }}</div>
                <div class="text-caption text-grey">
                  {{ formatTimestamp(message.createdAt) }}
                </div>
              </div>
            </div>
          </div>
          <v-form @submit.prevent="sendMessage" class="mt-4">
            <v-text-field
              v-model="newMessage"
              label="Type a message..."
              outlined
              dense
              hide-details
            >
              <template #append>
                <v-btn
                  type="submit"
                  color="primary"
                  icon="mdi-send"
                  :disabled="!newMessage.trim()"
                ></v-btn>
              </template>
            </v-text-field>
          </v-form>
        </div>
        <div v-else class="fill-height d-flex justify-center align-center">
          <v-alert type="info" border="start" prominent>
            Please log in to see the chat.
          </v-alert>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.chat-container {
  height: 100%;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 16px;
}

.messages-list {
  overflow-y: auto;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  display: flex;
  flex-direction: column;
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 12px;
  background-color: #f1f1f1;
  align-self: flex-start;
  word-wrap: break-word;
}

.message.my-message {
  background-color: #d1eaff;
  align-self: flex-end;
}

.message-content {
  display: flex;
  flex-direction: column;
}

.my-message .message-content {
  align-items: flex-end;
}
</style>
