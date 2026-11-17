-- Подборки /g (server/global/engine/collections/, план — TASKS.md «ТЕКУЩАЯ ЗАДАЧА: подборки /g»).
--
-- collection_wizard   — шаг и выбор пользователя в мастере подборки (одно сообщение с кнопками;
--                       в callback_data Telegram помещается только 64 байта, поэтому выбор живёт здесь).
-- collections         — собранные подборки: параметры и 10 тайтлов с ключами трейлеров.
--                       Основа для «Ещё вариант», будущих каруселей и публикаций.
-- media_trailers      — кэш найденных трейлеров TMDB (и отметка «трейлера нет»).
-- people_directory    — справочник популярных актёров и режиссёров с датами рождения и смерти
--                       (именинники, этап 4: у TMDB нет запроса «кто родился сегодня»).
--
-- Выполнить в Supabase SQL Editor. Повторный запуск безопасен. Доступ только service_role.

begin;

create table if not exists public.collection_wizard (
    telegram_id bigint primary key,
    chat_id bigint,
    message_id bigint,
    state jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

create table if not exists public.collections (
    id uuid primary key default gen_random_uuid(),
    telegram_id bigint not null,
    params jsonb not null,
    -- [{rank, media_type, content_type, id, title, year, score, trailer_key, trailer_language}]
    items jsonb not null default '[]'::jsonb,
    -- Кандидаты после ранжирования (id и тип) — «Ещё вариант (11–20)» берёт следующие отсюда.
    candidates jsonb not null default '[]'::jsonb,
    page integer not null default 0,
    status text not null default 'draft',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint collections_status_check check (status in ('draft', 'archived'))
);

create index if not exists collections_by_user
    on public.collections (telegram_id, created_at desc);

create table if not exists public.media_trailers (
    media_type text not null,
    media_id bigint not null,
    -- null: трейлера не нашлось (на момент checked_at)
    video_key text,
    language text,
    video_type text,
    name text,
    checked_at timestamptz not null default now(),
    primary key (media_type, media_id),
    constraint media_trailers_media_type_check check (media_type in ('movie', 'tv'))
);

create table if not exists public.people_directory (
    person_id bigint primary key,
    name text not null,
    name_original text,
    department text,
    birthday date,
    deathday date,
    popularity double precision,
    profile_path text,
    updated_at timestamptz not null default now()
);

create index if not exists people_directory_birthday
    on public.people_directory (extract(month from birthday), extract(day from birthday))
    where birthday is not null;

alter table public.collection_wizard enable row level security;
alter table public.collections enable row level security;
alter table public.media_trailers enable row level security;
alter table public.people_directory enable row level security;

commit;

-- Откат:
--   drop table if exists public.collection_wizard, public.collections,
--       public.media_trailers, public.people_directory;
