-- Обложки экранов мастера подборок /g.
--
-- Раз в квартал GitHub Actions (.github/workflows/collection-covers.yml) запускает
-- scripts/covers/buildCovers.mjs: свежие постеры из TMDB → несколько вариантов обложки на экран →
-- отправка в служебный Telegram-канал (TELEGRAM_MEDIA_STORAGE_CHAT_ID) → file_id сюда.
-- Бот показывает случайный вариант последней партии (batch) для своего экрана.
--
-- Выполнить в Supabase SQL Editor. Повторный запуск безопасен. Доступ только service_role.

begin;

create table if not exists public.collection_covers (
    id bigint generated always as identity primary key,
    -- Партия одного запуска: старые партии скрипт удаляет после успешной записи новой.
    batch text not null,
    -- Экран мастера: home, root, series, criterion, filter, direction, period, loading.
    screen text not null,
    variant integer not null,
    file_id text not null,
    -- poster_path TMDB, попавшие на обложку (для истории и повторной отрисовки).
    posters jsonb not null default '[]'::jsonb,
    seed bigint,
    created_at timestamptz not null default now(),
    constraint collection_covers_unique unique (batch, screen, variant)
);

create index if not exists collection_covers_by_screen
    on public.collection_covers (screen, created_at desc);

alter table public.collection_covers enable row level security;

commit;

-- Откат:
--   drop table if exists public.collection_covers;
