-- أرباحي: جدول واحد يحفظ كل شيء (منتجات، أوراق استلام، إعدادات...) لكل مستخدم.
-- الصق هذا الملف كاملاً في Supabase > SQL Editor ثم اضغط Run.

create table if not exists public.docs (
  user_id   uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind      text        not null,
  id        text        not null,
  data      jsonb       not null default '{}'::jsonb,
  updated_at bigint     not null,                      -- وقت آخر تعديل (ميلي ثانية) لحسم التعارض
  deleted   boolean     not null default false,
  synced_at timestamptz not null default now(),        -- يضبطه السيرفر عند كل كتابة
  primary key (user_id, kind, id)
);

create index if not exists docs_user_synced on public.docs (user_id, synced_at);

-- أمان: كل مستخدم يرى ويعدّل بياناته فقط
alter table public.docs enable row level security;

drop policy if exists "own rows" on public.docs;
create policy "own rows" on public.docs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.touch_synced_at() returns trigger
language plpgsql as $$
begin
  new.synced_at = now();
  return new;
end $$;

drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.touch_synced_at();
