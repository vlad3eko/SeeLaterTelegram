-- Обложки /g для каждого бота отдельно.
--
-- file_id в Telegram принадлежит боту, который загрузил файл: 19.11.2026 тестовый бот перестал
-- показывать обложки, загруженные боевым. Теперь scripts/covers/buildCovers.mjs загружает каждую
-- обложку от имени обоих ботов, а сервер берёт строки своего (prod — боевой, dev — тестовый).
-- Существующие строки остаются боевыми (default 'prod').
--
-- Выполнить в Supabase SQL Editor. Повторный запуск безопасен.

begin;

alter table public.collection_covers
    add column if not exists bot text not null default 'prod';

alter table public.collection_covers
    drop constraint if exists collection_covers_bot_check;
alter table public.collection_covers
    add constraint collection_covers_bot_check check (bot in ('prod', 'dev'));

alter table public.collection_covers
    drop constraint if exists collection_covers_unique;
alter table public.collection_covers
    add constraint collection_covers_unique unique (batch, screen, variant, bot);

commit;

-- Откат:
--   delete from public.collection_covers where bot = 'dev';
--   alter table public.collection_covers drop constraint collection_covers_unique;
--   alter table public.collection_covers add constraint collection_covers_unique unique (batch, screen, variant);
--   alter table public.collection_covers drop constraint collection_covers_bot_check;
--   alter table public.collection_covers drop column bot;
