-- E0 Gate 1: emergency email-queue containment (ACL + search_path only).
-- Changes NO function body. Applies atomically inside the managed migration
-- transaction. Forward-only: never restore EXECUTE to PUBLIC/anon/authenticated.

set local lock_timeout = '5s';

revoke execute on function public.enqueue_email(text, jsonb) from public, anon, authenticated;
revoke execute on function public.read_email_batch(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.delete_email(text, bigint) from public, anon, authenticated;
revoke execute on function public.move_to_dlq(text, text, bigint, jsonb) from public, anon, authenticated;

grant execute on function public.enqueue_email(text, jsonb) to postgres, service_role;
grant execute on function public.read_email_batch(text, integer, integer) to postgres, service_role;
grant execute on function public.delete_email(text, bigint) to postgres, service_role;
grant execute on function public.move_to_dlq(text, text, bigint, jsonb) to postgres, service_role;

revoke execute on function public.email_queue_dispatch() from public, anon, authenticated, service_role;
revoke execute on function public.email_queue_wake() from public, anon, authenticated, service_role;

grant execute on function public.email_queue_dispatch() to postgres;
grant execute on function public.email_queue_wake() to postgres;

alter function public.enqueue_email(text, jsonb) set search_path to '';
alter function public.read_email_batch(text, integer, integer) set search_path to '';
alter function public.delete_email(text, bigint) set search_path to '';
alter function public.move_to_dlq(text, text, bigint, jsonb) set search_path to '';

notify pgrst, 'reload schema';