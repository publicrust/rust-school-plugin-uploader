# Requirements Traceability Matrix

| REQ-ID | Specification Quote | Implementation Targets | Tests |
| --- | --- | --- | --- |
| REQ-1 | «Загрузить оба индекса параллельно, валидировать схему (наличие `items`).» | `src/api.ts`, `src/config.ts`, `src/utils/http.ts`, `src/index.ts` | `tests/api.test.ts` |
| REQ-2 | «Объединить (merge) по ключу, отдавая приоритет заполненным полям (author/version/description) из `crawled`.» | `src/merger.ts` | `tests/merger.test.ts` |
| REQ-3 | «Отфильтровать `deleted_repositories.json` (если доступен).» | `src/api.ts` | `tests/api.test.ts` |
| REQ-4 | «Сравнить итоговый список с кешом: Новый плагин → отправить уведомление. Обновлённый (по `ETag`/`Last-Modified`/хэшу файла) → отправить уведомление. Без изменений → пропустить.» | `src/diff.ts`, `src/cache.ts`, `src/index.ts` | `tests/diff.test.ts` |
| REQ-5 | «Сформировать Discord embed … и прикрепить файл плагина (`.cs`), если не превышает лимит.» | `src/webhook.ts` | `tests/webhook.test.ts` |
| REQ-6 | «Идемпотентность уведомлений … состояние (`plugins-state.json`) пишется после успешной отправки.» | `src/cache.ts`, `src/index.ts` | `tests/diff.test.ts` |
| REQ-7 | «CLI: `plugins notify` … `plugins dry-run` … `plugins reset` … `plugins state`.» | `src/index.ts` | `tests/cli.test.ts` |
| REQ-8 | «Параллелизм управляемый (`PLUGINS_CONCURRENCY`, по умолчанию 6). Повторы: ≤ 3 с экспоненциальной задержкой.» | `src/utils/http.ts`, `src/api.ts`, `src/index.ts`, `src/webhook.ts` | `tests/http.test.ts` |
| REQ-9 | «Логи: INFO (сводка), DEBUG (детали HTTP/кеша), ERROR (исключения).» | `src/logger.ts`, `src/index.ts` | `tests/logger.test.ts` |
| REQ-10 | «Мы просто загружаем все 31к плагинов. А если они изменились то нам похуй.» | `src/cli.ts`, `src/api.ts`, `src/webhook.ts` | `tests/sequential.test.ts` |
