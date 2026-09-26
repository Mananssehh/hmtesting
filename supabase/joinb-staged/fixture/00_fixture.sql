-- Disposable fixture: minimal stand-ins for the objects the join functions touch.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

-- Mirror production E0b default: postgres-created functions get PUBLIC (global)
-- plus postgres/service_role, NOT anon/authenticated directly.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dj_id uuid, name text NOT NULL, venue text, dj_name text NOT NULL DEFAULT 'DJ',
  room_code text UNIQUE NOT NULL, is_active boolean DEFAULT true,
  requests_status text NOT NULL DEFAULT 'live',
  allow_explicit boolean DEFAULT true, require_approval boolean DEFAULT false,
  cooldown_seconds int DEFAULT 0, rules_text text);
CREATE TABLE public.event_banned_guests (event_id uuid, user_id uuid);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, nickname text, points int DEFAULT 0);
CREATE TABLE public.event_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL, user_id uuid NOT NULL,
  nickname text, joined_at timestamptz DEFAULT now(), last_seen_at timestamptz DEFAULT now(),
  UNIQUE (event_id, user_id));
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_banned_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

-- Stand-in for trg_event_join (first join awards 1 point; refresh does not).
CREATE FUNCTION public.on_event_join() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS
  $$ BEGIN UPDATE public.profiles SET points = points + 1 WHERE id = NEW.user_id; RETURN NEW; END $$;
CREATE TRIGGER trg_event_join AFTER INSERT ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public.on_event_join();

INSERT INTO auth.users VALUES
  ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');
INSERT INTO public.profiles(id,nickname) VALUES
  ('00000000-0000-0000-0000-00000000000a','ProfileA'),
  ('00000000-0000-0000-0000-00000000000b','  '),
  ('00000000-0000-0000-0000-00000000000c','Banned');
INSERT INTO public.events(id,name,room_code,is_active,requests_status) VALUES
  ('11111111-1111-1111-1111-111111111111','Live','LIVE01',true,'live'),
  ('22222222-2222-2222-2222-222222222222','Off','OFF001',false,'live'),
  ('33333333-3333-3333-3333-333333333333','Ended','END001',true,'ended');
INSERT INTO public.event_banned_guests VALUES
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000c');
