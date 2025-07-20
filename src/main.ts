import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify'
import { pinia } from './stores'

const app = createApp(App)

app.use(createPinia())
app.use(pinia)
app.use(router)
app.use(vuetify)

app.mount('#app')
