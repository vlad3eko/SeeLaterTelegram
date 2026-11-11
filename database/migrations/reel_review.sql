-- Проверка Reel перед публикацией (ручная ветка, см. TASKS.md).
--
-- Выполнить в Supabase SQL Editor ДО выкатки кода бота: новый код пишет
-- card_edit_session.trailer_key_source при каждом сохранении сессии и без этой
-- колонки сессия редактирования перестанет сохраняться.
--
-- Новых ограничений на старые строки нет: у существующих задач review_mode = 'auto'
-- и worker_phase = 'full', то есть прежнее поведение.

begin;

-- 1. Сессия редактирования: ключ трейлера введён вручную («Изменить ключ трейлера»).
alter table public.card_edit_session
    add column if not exists trailer_key_source text;

alter table public.card_edit_session
    drop constraint if exists card_edit_session_trailer_key_source_check;

alter table public.card_edit_session
    add constraint card_edit_session_trailer_key_source_check
        check (trailer_key_source is null or trailer_key_source = 'manual');

-- 2. Задача Reel.
--    review_mode           manual: clean и хук проверяет администратор; auto: как раньше.
--    worker_phase          что делает следующий запуск воркера:
--                          full   — всё сразу (auto);
--                          clean  — собрать clean и остановиться на проверке;
--                          hooks  — 4 варианта хука по текущему clean;
--                          finish — субтитры, оформление, загрузка (хук из input_payload.hook
--                                   или, если его нет, один хук от Gemini).
--    clean_variant         номер фрагмента трейлера (0 — прежняя середина минус 10 с).
--    clean_preview_r2_url  лёгкая копия clean для показа в Telegram.
--    hook_options          варианты хука для кнопок 1–4.
--    review_message_id     сообщение с кнопками в чате администратора.
--    review_expires_at     после этого времени задача идёт дальше без администратора.
alter table public.reel_processing_jobs
    add column if not exists review_mode text not null default 'auto',
    add column if not exists worker_phase text not null default 'full',
    add column if not exists clean_variant integer not null default 0,
    add column if not exists clean_preview_r2_url text,
    add column if not exists hook_options jsonb,
    add column if not exists review_message_id bigint,
    add column if not exists review_expires_at timestamptz;

alter table public.reel_processing_jobs
    drop constraint if exists reel_processing_jobs_review_mode_check;
alter table public.reel_processing_jobs
    add constraint reel_processing_jobs_review_mode_check
        check (review_mode in ('auto', 'manual'));

alter table public.reel_processing_jobs
    drop constraint if exists reel_processing_jobs_worker_phase_check;
alter table public.reel_processing_jobs
    add constraint reel_processing_jobs_worker_phase_check
        check (worker_phase in ('full', 'clean', 'hooks', 'finish'));

alter table public.reel_processing_jobs
    drop constraint if exists reel_processing_jobs_clean_variant_check;
alter table public.reel_processing_jobs
    add constraint reel_processing_jobs_clean_variant_check
        check (clean_variant >= 0 and clean_variant < 1000);

-- Поиск просроченных проверок (эндпоинт expireReviews, раз в час).
create index if not exists reel_processing_jobs_review_expiry
    on public.reel_processing_jobs (review_expires_at)
    where status = 'awaiting_review';

-- 3. В рабочей базе у status есть CHECK со списком статусов
--    (reel_processing_jobs_status_check, в миграциях репозитория его не было): без
--    'awaiting_review' воркер падает на переходе к проверке (11.11). Блок дописывает
--    новые значения в существующие ограничения status и step, остальное не трогает.
do $$
declare
    con record;
    def text;
    additions text;
begin
    for con in
        select c.conname, pg_get_constraintdef(c.oid) as def, a.attname
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
        where c.conrelid = 'public.reel_processing_jobs'::regclass
          and c.contype = 'c'
          and a.attname in ('status', 'step')
          and pg_get_constraintdef(c.oid) like '%ARRAY[%'
    loop
        additions := case con.attname
            when 'status' then '''awaiting_review''::text, '
            else '''clean_review''::text, ''hook_choice''::text, '
        end;

        if con.def like '%awaiting_review%' or con.def like '%clean_review%' then
            continue;
        end if;

        def := replace(con.def, 'ARRAY[', 'ARRAY[' || additions);

        execute format('alter table public.reel_processing_jobs drop constraint %I', con.conname);
        execute format('alter table public.reel_processing_jobs add constraint %I %s', con.conname, def);

        raise notice 'updated %: %', con.conname, def;
    end loop;
end $$;

commit;

-- Откат (после отката кода):
--   alter table public.reel_processing_jobs
--       drop column if exists review_mode, drop column if exists worker_phase,
--       drop column if exists clean_variant, drop column if exists clean_preview_r2_url,
--       drop column if exists hook_options, drop column if exists review_message_id,
--       drop column if exists review_expires_at;
--   alter table public.card_edit_session drop column if exists trailer_key_source;
