-- Homepage limiter only. Does not alter exam tables, policies or auth.
begin;
create role homepage_login_owner nologin noinherit;
grant homepage_login_owner to postgres;
create schema homepage_login authorization homepage_login_owner;
revoke all on schema homepage_login from public;
grant usage on schema homepage_login to anon;
grant usage on schema extensions to homepage_login_owner;
grant execute on function extensions.digest(text,text) to homepage_login_owner;
create table homepage_login.state (
 id boolean primary key default true check(id),
 token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
 bucket bigint not null default -1,
 total integer not null default 0 check(total between 0 and 30),
 ips jsonb not null default '{}'::jsonb check(jsonb_typeof(ips)='object')
);
alter table homepage_login.state owner to homepage_login_owner;
alter table homepage_login.state enable row level security;
revoke all on homepage_login.state from public, anon, authenticated;
create function homepage_login.consume_attempt(p_token text,p_ip_hash text)
returns jsonb language plpgsql security definer
set search_path = '' set lock_timeout = '2s' set statement_timeout = '4s'
as $function$
declare
 s homepage_login.state%rowtype;
 current_bucket bigint;
 ip_count integer;
 retry_after integer;
begin
 if p_token is null or length(p_token) <> 64 or p_token !~ '^[a-f0-9]{64}$'
    or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then
   raise exception 'Invalid limiter credentials or input' using errcode='28000';
 end if;
 -- Reject unauthenticated callers before acquiring the counter lock.
 select * into s from homepage_login.state where id=true;
 if not found or s.token_hash <> encode(extensions.digest(p_token,'sha256'),'hex') then
   raise exception 'Invalid limiter credentials or input' using errcode='28000';
 end if;
 select * into s from homepage_login.state where id=true for update;
 -- Recheck credentials after obtaining the lock in case of rotation.
 if s.token_hash <> encode(extensions.digest(p_token,'sha256'),'hex') then
   raise exception 'Invalid limiter credentials or input' using errcode='28000';
 end if;
 current_bucket := floor(extract(epoch from clock_timestamp()) / 900)::bigint;
 retry_after := greatest(1,ceil((current_bucket+1)*900 - extract(epoch from clock_timestamp()))::integer);
 if s.bucket <> current_bucket then
   s.bucket := current_bucket; s.total := 0; s.ips := '{}'::jsonb;
 end if;
 ip_count := coalesce((s.ips->>p_ip_hash)::integer,0);
 if s.total >= 30 or ip_count >= 5 then
   return jsonb_build_object('allowed',false,'retry_after',retry_after);
 end if;
 s.ips := jsonb_set(s.ips,array[p_ip_hash],to_jsonb(ip_count+1),true);
 update homepage_login.state set bucket=s.bucket,total=s.total+1,ips=s.ips where id=true;
 return jsonb_build_object('allowed',true,'retry_after',retry_after);
end
$function$;
alter function homepage_login.consume_attempt(text,text) owner to homepage_login_owner;
revoke all on function homepage_login.consume_attempt(text,text) from public,anon,authenticated;
grant execute on function homepage_login.consume_attempt(text,text) to anon;
-- Exposed wrapper has no elevated privileges. Its private implementation authenticates
-- a dedicated machine token; no browser/user JWT grants access to the counter.
create function public.homepage_consume_login_attempt(p_token text,p_ip_hash text)
returns jsonb language sql security invoker
set search_path = ''
as $function$ select homepage_login.consume_attempt(p_token,p_ip_hash); $function$;
revoke all on function public.homepage_consume_login_attempt(text,text) from public,anon,authenticated;
grant execute on function public.homepage_consume_login_attempt(text,text) to anon;
comment on schema homepage_login is 'Homepage temporary login limiter; independent of CongchungVND exam data';
notify pgrst, 'reload schema';
commit;
