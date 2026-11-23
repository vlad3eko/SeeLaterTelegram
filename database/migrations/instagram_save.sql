-- Instagram «СОХРАНИТЬ» (server/global/engine/instagram/comments/): комментарий под Reel → ответ в Direct
-- со ссылкой на бота → /start ig_<токен> → фильм в favorites. Применяет владелец в Supabase SQL Editor.
-- Код без этих таблиц и колонок не падает: таймер отвечает skipped, ссылка ig_ — «устарела».

-- Привязка Instagram к пользователю: id комментатора, который Meta отдаёт для нашего аккаунта
-- (по нему же доставляется Direct). Пусто — не привязан. Записывается при первом переходе по ссылке.
alter table users add column if not exists instagram_id text;
alter table users add column if not exists instagram_linked_at timestamptz;
create unique index if not exists users_instagram_id on users (instagram_id) where instagram_id is not null;

-- Отложенные действия бота (server/bot/handlers/channel/pendingActions.ts): кнопки, нажатые без подписки на
-- обязательные каналы, — [{payload, at}], до 10 штук на 24 часа; выполняются сами после подписки.
alter table users add column if not exists pending_actions jsonb not null default '[]'::jsonb;

-- Reel ↔ фильм. Reels выкладываются вручную, поэтому таймер находит новый Reel сам, а фильм
-- подтверждает администратор кнопкой (candidates — варианты из reel_processing_jobs).
create table if not exists instagram_campaigns (
    id uuid primary key default gen_random_uuid(),
    instagram_media_id text not null unique,
    permalink text,
    caption text,
    published_at timestamptz,
    candidates jsonb not null default '[]',
    media_id bigint,
    media_type text check (media_type in ('movie', 'tv')),
    title text,
    status text not null default 'pending' check (status in ('pending', 'active', 'ignored', 'completed')),
    admin_message_id bigint,
    last_seen_at timestamptz,
    next_poll_at timestamptz,
    poll_lease_until timestamptz,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (status <> 'active' or (media_id is not null and media_type is not null))
);
create index if not exists instagram_campaigns_poll on instagram_campaigns (status, next_poll_at);

-- Комментарии с ключевым словом и судьба ответа. comment_id — защита от повторной отправки:
-- Meta разрешает один Private Reply на комментарий. Текст и username комментария не храним;
-- commenter_id и token_hash стираются через 30 дней.
create table if not exists instagram_comment_leads (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references instagram_campaigns (id) on delete cascade,
    comment_id text not null unique,
    commenter_id text,
    commented_at timestamptz not null,
    status text not null check (status in (
        'queued', 'sending', 'sent', 'send_failed', 'send_unknown', 'expired', 'duplicate',
        'started', 'saved', 'already_saved', 'auto_saved'
    )),
    token_hash text unique,
    token_expires_at timestamptz,
    error_category text,
    telegram_id bigint,
    sent_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists instagram_comment_leads_queue on instagram_comment_leads (status, created_at);
create index if not exists instagram_comment_leads_commenter on instagram_comment_leads (campaign_id, commenter_id);

alter table instagram_campaigns enable row level security;
alter table instagram_comment_leads enable row level security;

-- Откат:
-- drop table instagram_comment_leads; drop table instagram_campaigns;
-- drop index users_instagram_id; alter table users drop column instagram_id, drop column instagram_linked_at, drop column pending_actions;
