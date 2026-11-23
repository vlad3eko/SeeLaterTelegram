-- Отложенные действия бота: человек нажал кнопку («Сохранить» под постом, «Поиск», «Актёры», …), но не
-- подписан на обязательные каналы или ещё не запускал бота. Бот запоминает действие (payload ссылки
-- /start) на 24 часа и выполняет его сам, как только человек подписался (server/bot/handlers/channel/pendingActions.ts).
-- Без таблицы бот работает как раньше: просит подписаться, действие не запоминается.
create table if not exists bot_pending_actions (
    id uuid primary key default gen_random_uuid(),
    telegram_id bigint not null,
    payload text not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    done_at timestamptz,
    unique (telegram_id, payload)
);
create index if not exists bot_pending_actions_user on bot_pending_actions (telegram_id, done_at, expires_at);

alter table bot_pending_actions enable row level security;

-- Откат:
-- drop table bot_pending_actions;
