-- Сводка обновлений по сохранённым (server/global/engine/notifications/, задача Notification в TASKS.md).
--
-- «Сохранить» = подписка. За тайтлом следим ОДИН раз, сколько бы людей его ни сохранили:
--   media_watch        — одна строка на тайтл: текущее состояние из TMDB, снимок для сравнения
--                        и время следующей проверки;
--   media_events       — найденные изменения, одно событие на тайтл (event_key уникален: повтор
--                        таймера и два источника одного трейлера не дают дублей);
--   digest_deliveries  — одна сводка в день на пользователя: состав, готовое сообщение, статус.
-- Подписчики события — строки favorites с тем же (media_type, tmdb_id).
--
-- Выполнить в Supabase SQL Editor. Повторный запуск безопасен.

begin;

create table if not exists public.media_watch (
    media_type text not null check (media_type in ('movie', 'tv')),
    tmdb_id bigint not null,
    title text,
    poster_path text,
    status text,
    release_date date,              -- фильм: выбранная дата (Россия, кинопрокат → Россия, ограниченный → общая премьера)
    digital_date date,              -- фильм: цифровой релиз в России
    next_episode_air_date date,     -- сериал: дата следующей серии
    next_episode text,              -- «2 сезон, 5 серия»
    last_episode_id bigint,         -- сериал: последняя вышедшая серия
    snapshot jsonb not null default '{}'::jsonb,
    checked_at timestamptz,
    next_check_at timestamptz not null default now(),
    last_error text,
    created_at timestamptz not null default now(),
    primary key (media_type, tmdb_id)
);

create index if not exists media_watch_due on public.media_watch (next_check_at);
create index if not exists media_watch_release on public.media_watch (release_date) where release_date is not null;

create table if not exists public.media_events (
    id bigint generated always as identity primary key,
    media_type text not null,
    tmdb_id bigint not null,
    event_type text not null,       -- movie_premiere | release_date_changed | release_date_set | tv_episodes | trailer_added | posters_added
    event_key text not null unique,
    event_date date,
    payload jsonb not null default '{}'::jsonb,
    source text not null,           -- tmdb | youtube_queue | reel_job | calendar
    detected_at timestamptz not null default now()
);

create index if not exists media_events_detected on public.media_events (detected_at);
create index if not exists media_events_media on public.media_events (media_type, tmdb_id, detected_at desc);

create table if not exists public.digest_deliveries (
    id bigint generated always as identity primary key,
    user_id bigint not null references public.users (id) on delete cascade,
    digest_date date not null,
    event_ids bigint[] not null,
    cutoff timestamptz not null,    -- события до этой отметки учтены; следующая сводка берёт позже
    payload jsonb not null,         -- готовое сообщение: повтор отправки шлёт ровно его
    status text not null default 'pending'
        check (status in ('pending', 'sending', 'sent', 'failed', 'unknown', 'blocked')),
    telegram_message_id bigint,
    attempts integer not null default 0,
    last_error text,
    created_at timestamptz not null default now(),
    sent_at timestamptz,
    unique (user_id, digest_date)
);

create index if not exists digest_deliveries_status on public.digest_deliveries (digest_date, status);
create index if not exists digest_deliveries_user on public.digest_deliveries (user_id, cutoff desc);

alter table public.users add column if not exists digest_enabled boolean not null default true;
alter table public.users add column if not exists bot_blocked_at timestamptz;

create index if not exists favorites_media on public.favorites (media_type, tmdb_id);

-- Доступ только у сервера (service role), как у остальных служебных таблиц.
alter table public.media_watch enable row level security;
alter table public.media_events enable row level security;
alter table public.digest_deliveries enable row level security;

commit;
