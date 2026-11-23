-- Исправления по логическому аудиту (23.11). Применяет владелец в Supabase SQL Editor, целиком.
-- Код без этой миграции не падает: в режиме INSTAGRAM_COMMENTS=log таймер отвечает
-- «примените миграцию instagram_fixes.sql», сохранение тайтла другого типа с тем же TMDB id — понятная ошибка.

-- 1. Статус logged: комментарий записан в режиме log (только для просмотра, ответа не было и не будет —
--    после включения send ответ получат только новые комментарии).
alter table instagram_comment_leads drop constraint if exists instagram_comment_leads_status_check;
alter table instagram_comment_leads add constraint instagram_comment_leads_status_check check (status in (
    'queued', 'logged', 'sending', 'sent', 'send_failed', 'send_unknown', 'expired', 'duplicate',
    'started', 'saved', 'already_saved', 'auto_saved'
));

-- 2. Уникальный ключ favorites с типом: фильм и сериал с одним TMDB id — разные тайтлы.
--    Дублей (user_id, tmdb_id) в базе на 23.11 нет (проверено), поэтому новый ключ ставится без чистки.
--    Старый ключ (user_id, tmdb_id) — constraint или индекс с неизвестным именем — находим и убираем.
do $$
declare
    item record;
begin
    for item in
        select con.conname as name, 'constraint' as kind
        from pg_constraint con
        where con.conrelid = 'public.favorites'::regclass and con.contype = 'u'
          and (select array_agg(att.attname::text order by att.attname)
               from unnest(con.conkey) key join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key)
              = array['tmdb_id', 'user_id']
        union all
        select idx.relname as name, 'index' as kind
        from pg_index ind join pg_class idx on idx.oid = ind.indexrelid
        where ind.indrelid = 'public.favorites'::regclass and ind.indisunique and not ind.indisprimary
          and not exists (select 1 from pg_constraint c where c.conindid = ind.indexrelid)
          and (select array_agg(att.attname::text order by att.attname)
               from unnest(ind.indkey::int2[]) key join pg_attribute att on att.attrelid = ind.indrelid and att.attnum = key)
              = array['tmdb_id', 'user_id']
    loop
        if item.kind = 'constraint' then
            execute format('alter table public.favorites drop constraint %I', item.name);
        else
            execute format('drop index public.%I', item.name);
        end if;
        raise notice 'favorites: убран старый ключ % (%)', item.name, item.kind;
    end loop;
end $$;

alter table favorites drop constraint if exists favorites_user_tmdb_media_key;
alter table favorites add constraint favorites_user_tmdb_media_key unique (user_id, tmdb_id, media_type);

-- Проверка после применения (должна вернуть одну строку с favorites_user_tmdb_media_key):
-- select conname from pg_constraint where conrelid = 'public.favorites'::regclass and contype = 'u';

-- Откат:
-- alter table favorites drop constraint favorites_user_tmdb_media_key;
-- alter table favorites add constraint favorites_user_id_tmdb_id_key unique (user_id, tmdb_id);
-- alter table instagram_comment_leads drop constraint instagram_comment_leads_status_check;
-- alter table instagram_comment_leads add constraint instagram_comment_leads_status_check check (status in (
--     'queued', 'sending', 'sent', 'send_failed', 'send_unknown', 'expired', 'duplicate',
--     'started', 'saved', 'already_saved', 'auto_saved'));
-- (откат ключа сработает, только если нет фильма и сериала с одним TMDB id у одного человека; откат статуса — если нет строк logged)
