-- Связки подборок /g и судья (server/global/engine/collections/judge/, ТЗ — TASKS.md
-- «ТЗ: полки, связки, судья, „Похожее“»).
--
-- collection_bundle_verdicts — вердикт судьи: тайтл × связка × версия рубрики (кэш: при той же
--                              версии рубрики тайтл повторно не судится). snapshot — снимок тайтла
--                              (название, дата, оценки, жанры, страна, полка): судимую связку бот
--                              собирает из «да» без запросов discover.
-- collection_bundle_runs     — расчёты: 2 связки 2 раза в неделю (scripts/bundles/runBundles.ts,
--                              .github/workflows/collection-bundles.yml). stats — сводка и контрольные
--                              тайтлы (publishable = false — связка не показывается), items — готовый
--                              список с трейлерами для показа и будущей публикации.
-- collection_bundle_dossiers — досье тайтла (TMDB + раздел «Сюжет» Википедии): не ходить в источники
--                              повторно при смене рубрики.
--
-- Выполнить в Supabase SQL Editor. Повторный запуск безопасен. Доступ только service_role.

begin;

create table if not exists public.collection_bundle_verdicts (
    bundle_key text not null,
    media_type text not null,
    media_id bigint not null,
    rubric_version integer not null,
    verdict text not null,
    score integer not null default 0,
    confidence real not null default 0,
    reason text not null default '',
    reason_codes jsonb not null default '[]'::jsonb,
    -- [{criterion, source, quote, verified}]
    evidence jsonb not null default '[]'::jsonb,
    missing jsonb not null default '[]'::jsonb,
    sources jsonb not null default '[]'::jsonb,
    snapshot jsonb not null default '{}'::jsonb,
    model text not null default '',
    judged_at timestamptz not null default now(),
    primary key (bundle_key, media_type, media_id, rubric_version),
    constraint collection_bundle_verdicts_media_type_check check (media_type in ('movie', 'tv')),
    constraint collection_bundle_verdicts_verdict_check check (verdict in ('yes', 'borderline', 'no', 'insufficient'))
);

create index if not exists collection_bundle_verdicts_by_bundle
    on public.collection_bundle_verdicts (bundle_key, rubric_version, verdict);

create table if not exists public.collection_bundle_runs (
    id uuid primary key default gen_random_uuid(),
    bundle_key text not null,
    status text not null default 'queued',
    scheduled_for timestamptz,
    started_at timestamptz,
    finished_at timestamptz,
    stats jsonb not null default '{}'::jsonb,
    -- [{shelf, media_type, id, title, score, trailer_key, trailer_language}]
    items jsonb not null default '[]'::jsonb,
    error text,
    published_at timestamptz,
    created_at timestamptz not null default now(),
    constraint collection_bundle_runs_status_check check (status in ('queued', 'running', 'done', 'failed'))
);

create index if not exists collection_bundle_runs_by_bundle
    on public.collection_bundle_runs (bundle_key, created_at desc);

create table if not exists public.collection_bundle_dossiers (
    media_type text not null,
    media_id bigint not null,
    sources jsonb not null,
    fetched_at timestamptz not null default now(),
    primary key (media_type, media_id),
    constraint collection_bundle_dossiers_media_type_check check (media_type in ('movie', 'tv'))
);

alter table public.collection_bundle_verdicts enable row level security;
alter table public.collection_bundle_runs enable row level security;
alter table public.collection_bundle_dossiers enable row level security;

commit;

-- Откат:
-- drop table if exists public.collection_bundle_dossiers;
-- drop table if exists public.collection_bundle_runs;
-- drop table if exists public.collection_bundle_verdicts;
