## Проблемы

1. **Кнопки «Выйти» не выходят из Supabase/Google.** В `EmployerPanel.tsx` (`handleLogout`, строка 818) и в `CandidateFlow.tsx` (строки 1397, 1454, 2939) выполняется `localStorage.clear()` / `removeItem(...)` + `navigate("/main")`, но **никогда не вызывается `supabase.auth.signOut()`**. В результате:
   - In‑memory сессия в supabase‑клиенте остаётся;
   - `TelegramMiniAppBoot` / автологин может тут же снова восстановить сессию;
   - `localStorage.clear()` ломает другие настройки приложения (pendingGoogleAuth, чек‑листы и т.п.).

2. **Локального запоминания нет / постоянно надо логиниться.** В `supabase/client.ts` уже стоит `persistSession: true, storage: localStorage`, то есть сессия должна сохраняться. Реальная причина «не помнит» = п.1: `localStorage.clear()` стирает supabase‑токен при каждом «Выйти», а при автологине через MiniApp вытесняется веб‑сессия. Достаточно правильного `signOut` + не трогать остальной storage.

3. **«⚠️ finalize 200: unknown» при повторной регистрации через Google.** В `AuthCallback.tsx` это сообщение формируется только когда `res.ok=true`, но `data?.target` — undefined/пусто (см. `finalizeError = finalize ${res.status}: ${data?.error || data?.details || "unknown"}`). То есть edge‑функция вернула 200 с телом, в котором нет поля `target` (или JSON не распарсился). Логов нет, но недавняя правка `auth-google-finalize` (мерж аккаунтов / `account_kinds`) могла в редкой ветке вернуть пустое `target` или 200 без тела. Нужно:
   - На клиенте: не падать при пустом `target`, а резолвить путь по существующему профилю через `resolveProfilePathForUser` (фоллбек уже есть, но throw срабатывает раньше — поправить порядок).
   - На сервере: гарантировать, что `target` всегда заполнен (если ничего не нашли → `/main` или `/employer{publicId}/profile`), и добавить подробное логирование причины.

## Что делаю

### 1. Корректный выход из аккаунта
- В `EmployerPanel.tsx` переписать `handleLogout`:
  ```ts
  const handleLogout = async () => {
    try { await supabase.auth.signOut(); } catch {}
    // не трогаем весь localStorage — чистим только наши служебные ключи
    ["pendingGoogleAuth","cand_session_id","cand_role"].forEach(k => localStorage.removeItem(k));
    window.location.assign("/main"); // hard‑reload, чтобы сбросить in‑memory state
  };
  ```
- В `CandidateFlow.tsx` заменить все три места выхода (1397, 1454, 2939) на ту же логику через общий хелпер.
- (Опц.) Вынести `signOutEverywhere()` в `src/lib/auth.ts`, чтобы не дублировать.

### 2. Локальное запоминание
- Оставляем `persistSession: true` (уже так).
- Перестаём вызывать `localStorage.clear()` — это и было причиной «забывания» побочных данных.
- В `TelegramMiniAppBoot` ничего не меняем: если есть валидная сессия — она подхватится, пользователь сразу в кабинете.

### 3. Повторный вход без ошибки `finalize 200: unknown`
- **AuthCallback.tsx**: изменить порядок — если `target` пустой/`"/"`, СНАЧАЛА пробовать `resolveProfilePathForUser(user.id)`, и только если и он не дал результата — показывать ошибку. Так уже зарегистрированный пользователь всегда попадёт в свой кабинет, даже если finalize вернул пустой target.
- **edge `auth-google-finalize`**: 
  - Завернуть основную логику в try/catch так, чтобы любые ветки employer/candidate возвращали валидный `target` (никогда `""` / `"/"`).
  - Если intent=`employer` и `publicId` не получили после insert — перечитать employer по `user_id` и собрать target.
  - Если intent=`candidate` без проекта и без существующих кандидатов — вернуть `/main` (уже так, проверить).
  - Добавить `console.log` с user.id / intent / выбранной веткой, чтобы видеть в логах причину.
  - Перед `return json({ target })` — `if (!target) target = "/main";` страховка.

### 4. Проверка
- Локально: войти через Google → перезагрузить страницу (должен остаться в кабинете) → Выйти → войти заново (без ошибки) → выйти и зайти как соискатель (для проверки, что обе ветки чистые).

## Файлы, которые буду менять
- `src/pages/EmployerPanel.tsx` — `handleLogout`
- `src/pages/CandidateFlow.tsx` — 3 кнопки выхода
- `src/lib/auth.ts` — новый общий `signOutEverywhere()` (по желанию)
- `src/pages/AuthCallback.tsx` — фоллбек до throw
- `supabase/functions/auth-google-finalize/index.ts` — гарантированный непустой `target` + логи

Без миграций БД.