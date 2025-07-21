# Firebase Firestore Rules Documentation

## Security Rules for Chat Application

Для безопасной работы чат-приложения с Firestore, установите следующие правила в Firebase Console (Firestore -> Rules):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /messages/{message} {
      // Разрешить чтение только авторизованным пользователям
      allow read: if request.auth != null;

      // Разрешить запись с ограничениями:
      // Разрешить создание и обновление с ограничениями
      allow create, update: if
        // Только авторизованные пользователи
        request.auth != null
        // Сообщение должно быть строкой
        && request.resource.data.text is string
        // Минимальная длина сообщения - 1 символ
        && request.resource.data.text.size() > 0
        // Максимальная длина сообщения - 1000 символов
        && request.resource.data.text.size() < 1000
        // UID должен соответствовать авторизованному пользователю
        && request.resource.data.uid == request.auth.uid;

      // Разрешить удаление только своих сообщений
      allow delete: if request.auth != null && request.auth.uid == resource.data.uid;
    }
  }
}
```

## Как обновить правила

1. Откройте [Firebase Console](https://console.firebase.google.com/)
2. Выберите ваш проект
3. Перейдите в раздел "Firestore Database"
4. Откройте вкладку "Правила"
5. Вставьте приведенные выше правила
6. Нажмите "Опубликовать"

## Объяснение правил

- `allow read`: Ограничивает чтение сообщений только авторизованными пользователями
- `allow write`: Обеспечивает:
  - Авторизацию пользователя
  - Валидацию типа и длины сообщения
  - Проверку соответствия UID отправителя и авторизованного пользователя
