-- migrate:up
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.9 (Homebrew)
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_codes (
    id integer NOT NULL,
    code text NOT NULL,
    entity_type text NOT NULL,
    club_id integer,
    venue_id integer,
    label text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp(3) without time zone
);


--
-- Name: access_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.access_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: access_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.access_codes_id_seq OWNED BY public.access_codes.id;


--
-- Name: admin_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_settings (
    id text DEFAULT 'singleton'::text NOT NULL,
    llm_model text DEFAULT 'claude-haiku-4-5-20251001'::text NOT NULL,
    temperature double precision DEFAULT 0.7 NOT NULL,
    max_tokens integer DEFAULT 1000 NOT NULL,
    monthly_budget_usd double precision DEFAULT 5.00 NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: ai_assistant_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_assistant_logs (
    id text NOT NULL,
    session_id text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    input_tokens integer,
    output_tokens integer,
    estimated_cost_usd double precision,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    context_snapshot text,
    source text DEFAULT 'admin'::text NOT NULL
);


--
-- Name: ai_chat_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_chat_settings (
    id text NOT NULL,
    model text DEFAULT 'deepseek-chat'::text NOT NULL,
    context_hours integer DEFAULT 48 NOT NULL,
    max_venues integer DEFAULT 20 NOT NULL,
    max_clubs integer DEFAULT 20 NOT NULL,
    max_cost_per_message_usd double precision DEFAULT 0.05 NOT NULL,
    daily_cost_alert_usd double precision DEFAULT 5.00 NOT NULL,
    player_facing_enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    updated_by text
);


--
-- Name: app_club_managers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_club_managers (
    id text NOT NULL,
    app_club_id text NOT NULL,
    player_profile_id text NOT NULL,
    role text DEFAULT 'manager'::text NOT NULL,
    added_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    added_by_id text NOT NULL
);


--
-- Name: app_club_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_club_members (
    id text NOT NULL,
    app_club_id text NOT NULL,
    player_profile_id text NOT NULL,
    joined_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: app_clubs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_clubs (
    id text NOT NULL,
    name text NOT NULL,
    icon text,
    sport_id integer,
    privacy text DEFAULT 'public'::text NOT NULL,
    level text,
    auto_approve_new_members boolean DEFAULT true NOT NULL,
    creator_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: auth_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_accounts (
    id text NOT NULL,
    user_id text NOT NULL,
    type text NOT NULL,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    refresh_token text,
    access_token text,
    expires_at integer,
    token_type text,
    scope text,
    id_token text,
    session_state text
);


--
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_sessions (
    id text NOT NULL,
    session_token text NOT NULL,
    user_id text NOT NULL,
    expires timestamp(3) without time zone NOT NULL
);


--
-- Name: auth_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_users (
    id text NOT NULL,
    name text,
    email text,
    email_verified timestamp(3) without time zone,
    image text
);


--
-- Name: auth_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_verification_tokens (
    identifier text NOT NULL,
    token text NOT NULL,
    expires timestamp(3) without time zone NOT NULL
);


--
-- Name: blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocks (
    id text NOT NULL,
    blocker_id text NOT NULL,
    blocked_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: card_battles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_battles (
    id text NOT NULL,
    venue_id integer NOT NULL,
    initiating_squad_id text NOT NULL,
    rival_squad_id text NOT NULL,
    initiating_card_power integer NOT NULL,
    rival_card_power integer NOT NULL,
    winner_squad_id text,
    initiated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reveal_at timestamp(3) without time zone NOT NULL,
    counter_attack_window_ends_at timestamp(3) without time zone NOT NULL,
    battle_number integer DEFAULT 1 NOT NULL,
    is_counter_attack boolean DEFAULT false NOT NULL,
    parent_battle_id text
);


--
-- Name: club_daily_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.club_daily_stats (
    id integer NOT NULL,
    club_id integer NOT NULL,
    date text NOT NULL,
    total_sessions integer DEFAULT 0 NOT NULL,
    total_capacity integer DEFAULT 0 NOT NULL,
    total_joined integer DEFAULT 0 NOT NULL,
    avg_fill_rate double precision DEFAULT 0 NOT NULL,
    avg_fee double precision DEFAULT 0 NOT NULL,
    revenue_estimate double precision DEFAULT 0 NOT NULL
);


--
-- Name: club_daily_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.club_daily_stats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: club_daily_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.club_daily_stats_id_seq OWNED BY public.club_daily_stats.id;


--
-- Name: club_session_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.club_session_bookings (
    id text NOT NULL,
    player_profile_id text NOT NULL,
    club_session_id text NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    paid_status boolean DEFAULT false NOT NULL,
    attendance_status text DEFAULT 'unmarked'::text NOT NULL,
    requested_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    decided_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: club_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.club_sessions (
    id text NOT NULL,
    app_club_id text NOT NULL,
    host_id text NOT NULL,
    sport_id integer,
    format text NOT NULL,
    name text NOT NULL,
    start_time timestamp(3) without time zone NOT NULL,
    end_time timestamp(3) without time zone NOT NULL,
    duration_min integer NOT NULL,
    venue_id integer,
    venue_pending boolean DEFAULT false NOT NULL,
    max_players integer NOT NULL,
    requires_approval boolean DEFAULT false NOT NULL,
    auto_confirm_mode text DEFAULT 'open'::text NOT NULL,
    privacy text DEFAULT 'public'::text NOT NULL,
    fee_amount numeric(10,2),
    fee_currency text,
    skill_level_min numeric(5,3),
    skill_level_max numeric(5,3),
    host_role text DEFAULT 'host_and_play'::text NOT NULL,
    notes text,
    lifecycle_state text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: clubs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clubs (
    id integer NOT NULL,
    reclub_id integer NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    sport_id integer,
    community_id integer,
    num_members integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    zalo_url text,
    phone text,
    admins text[] DEFAULT '{}'::text[],
    market text DEFAULT 'hcm'::text NOT NULL
);


--
-- Name: clubs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clubs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clubs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clubs_id_seq OWNED BY public.clubs.id;


--
-- Name: content_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_posts (
    id text NOT NULL,
    post_type text NOT NULL,
    channel text NOT NULL,
    generated_text text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    scheduled_date timestamp(3) without time zone NOT NULL,
    posted_at timestamp(3) without time zone,
    post_now boolean DEFAULT false NOT NULL,
    error text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: daily_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_snapshots (
    id integer NOT NULL,
    session_id integer NOT NULL,
    scraped_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    joined integer DEFAULT 0 NOT NULL,
    waitlisted integer DEFAULT 0 NOT NULL
);


--
-- Name: daily_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.daily_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.daily_snapshots_id_seq OWNED BY public.daily_snapshots.id;


--
-- Name: feed_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_items (
    id text NOT NULL,
    profile_id text NOT NULL,
    type text NOT NULL,
    player_user_id text,
    payload jsonb NOT NULL,
    "timestamp" timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follows (
    id integer NOT NULL,
    follower_id text NOT NULL,
    followee_id bigint NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: follows_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.follows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: follows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.follows_id_seq OWNED BY public.follows.id;


--
-- Name: hcm_market_median_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcm_market_median_daily (
    date text NOT NULL,
    median_cost_per_hour double precision NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: kudos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kudos (
    id integer NOT NULL,
    from_player_id text NOT NULL,
    to_player_id bigint NOT NULL,
    type text NOT NULL,
    feed_item_id text,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
    CONSTRAINT kudos_type_check CHECK ((type = ANY (ARRAY['fistbump'::text, 'flame'::text, 'star'::text])))
);


--
-- Name: kudos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kudos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kudos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kudos_id_seq OWNED BY public.kudos.id;


--
-- Name: llm_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_usage_logs (
    id text NOT NULL,
    model text NOT NULL,
    input_tokens integer NOT NULL,
    output_tokens integer NOT NULL,
    cost_usd double precision NOT NULL,
    post_type text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: notifications_sent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications_sent (
    id integer NOT NULL,
    recipient_id text NOT NULL,
    sender_id text,
    type text NOT NULL,
    sent_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: notifications_sent_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_sent_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_sent_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_sent_id_seq OWNED BY public.notifications_sent.id;


--
-- Name: play_intents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.play_intents (
    id text NOT NULL,
    profile_id text NOT NULL,
    time_slot text NOT NULL,
    date text NOT NULL,
    zalo_number text,
    expires_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_brands (
    id text NOT NULL,
    profile_id text NOT NULL,
    brand text NOT NULL,
    support_level integer DEFAULT 1 NOT NULL,
    brand_xp integer DEFAULT 0 NOT NULL,
    selected_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    switched_count integer DEFAULT 0 NOT NULL
);


--
-- Name: player_dupr_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_dupr_history (
    id integer NOT NULL,
    player_id bigint NOT NULL,
    dupr_doubles numeric(5,3),
    recorded_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    source text DEFAULT 'scraper'::text NOT NULL
);


--
-- Name: player_dupr_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_dupr_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_dupr_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_dupr_history_id_seq OWNED BY public.player_dupr_history.id;


--
-- Name: player_gear; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_gear (
    id text NOT NULL,
    profile_id text NOT NULL,
    cap text,
    shirt text,
    paddle text,
    shoes text,
    updated_at timestamp(3) without time zone NOT NULL,
    setup_completed_at timestamp(3) without time zone
);


--
-- Name: player_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_profiles (
    id text NOT NULL,
    zalo_id text,
    display_name text,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_seen timestamp(3) without time zone NOT NULL,
    user_id text,
    reclub_user_id bigint,
    push_token text,
    push_token_updated_at timestamp(3) without time zone,
    last_active_at timestamp(3) without time zone,
    onboarding_completed boolean DEFAULT false NOT NULL,
    streak_computed_at timestamp(3) without time zone,
    streak_data jsonb,
    gender text,
    banned boolean DEFAULT false NOT NULL,
    report_flagged_at timestamp(3) without time zone,
    suspended boolean DEFAULT false NOT NULL,
    push_token_ios text,
    squad_nickname text,
    squad_nickname_set_at timestamp(3) without time zone,
    welcome_chest_claimed boolean DEFAULT false NOT NULL
);


--
-- Name: player_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_wallets (
    id text NOT NULL,
    profile_id text NOT NULL,
    club_tokens integer DEFAULT 0 NOT NULL,
    brand_tokens integer DEFAULT 0 NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.players (
    user_id bigint NOT NULL,
    username text,
    display_name text,
    dupr_singles numeric(5,3),
    dupr_doubles numeric(5,3),
    dupr_singles_reliability integer,
    dupr_doubles_reliability integer,
    dupr_id text,
    dupr_updated_at timestamp(3) without time zone,
    last_seen_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    image_url text
);


--
-- Name: pod_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_members (
    id integer NOT NULL,
    pod_id text NOT NULL,
    profile_id text NOT NULL,
    joined_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    left_at timestamp(3) without time zone
);


--
-- Name: pod_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pod_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pod_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pod_members_id_seq OWNED BY public.pod_members.id;


--
-- Name: pods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pods (
    id text NOT NULL,
    squad_id text,
    name text NOT NULL,
    emoji text NOT NULL,
    founder_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    disbanded_at timestamp(3) without time zone
);


--
-- Name: radar_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radar_sessions (
    id text NOT NULL,
    squad_id text NOT NULL,
    player_id text NOT NULL,
    venue_id integer NOT NULL,
    started_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    auto_ends_at timestamp(3) without time zone NOT NULL,
    stopped_at timestamp(3) without time zone,
    is_clash_active boolean DEFAULT false NOT NULL,
    clash_partner_squad_id text,
    inf_base integer,
    inf_final integer,
    state text DEFAULT 'active'::text NOT NULL
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id text NOT NULL,
    reporter_id text NOT NULL,
    reported_id text NOT NULL,
    reason text NOT NULL,
    detail text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: session_dupr_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_dupr_stats (
    session_id integer NOT NULL,
    scraped_date text NOT NULL,
    total_confirmed integer DEFAULT 0 NOT NULL,
    players_with_dupr integer DEFAULT 0 NOT NULL,
    dupr_participation_pct numeric(5,2) DEFAULT 0 NOT NULL,
    avg_dupr_singles numeric(5,3),
    avg_dupr_doubles numeric(5,3),
    updated_at timestamp(3) without time zone NOT NULL,
    returning_player_pct numeric(5,2)
);


--
-- Name: session_rosters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_rosters (
    id integer NOT NULL,
    session_id integer NOT NULL,
    user_id bigint NOT NULL,
    is_host boolean DEFAULT false NOT NULL,
    is_confirmed boolean DEFAULT true NOT NULL,
    scraped_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    first_seen_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: session_rosters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.session_rosters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: session_rosters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.session_rosters_id_seq OWNED BY public.session_rosters.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id integer NOT NULL,
    reference_code text NOT NULL,
    name text NOT NULL,
    club_id integer NOT NULL,
    venue_id integer,
    start_time text NOT NULL,
    end_time text NOT NULL,
    duration_min integer NOT NULL,
    max_players integer NOT NULL,
    fee_amount integer DEFAULT 0 NOT NULL,
    fee_currency text DEFAULT 'VND'::text NOT NULL,
    cost_per_hour double precision,
    privacy text DEFAULT 'public'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    skill_level_min double precision,
    skill_level_max double precision,
    perks text[] DEFAULT ARRAY[]::text[],
    event_url text NOT NULL,
    scraped_date text NOT NULL,
    description text
);


--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;


--
-- Name: squad_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.squad_alerts (
    id text NOT NULL,
    squad_id text NOT NULL,
    recipient_profile_id text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    payload jsonb,
    read_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: squad_card_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.squad_card_state (
    squad_id text NOT NULL,
    card_power_inf integer NOT NULL,
    card_level_multiplier numeric(4,2) NOT NULL,
    venues_owned_count integer DEFAULT 0 NOT NULL,
    active_members_this_week integer DEFAULT 0 NOT NULL,
    last_computed_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: squad_chest_openings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.squad_chest_openings (
    id integer NOT NULL,
    chest_id text NOT NULL,
    profile_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    tapped_at timestamp(3) without time zone,
    unlocks_at timestamp(3) without time zone,
    opened_at timestamp(3) without time zone,
    kudos_awarded integer,
    xp_awarded integer
);


--
-- Name: squad_chest_openings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.squad_chest_openings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: squad_chest_openings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.squad_chest_openings_id_seq OWNED BY public.squad_chest_openings.id;


--
-- Name: squad_chests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.squad_chests (
    id text NOT NULL,
    squad_id text NOT NULL,
    earner_id text NOT NULL,
    session_id integer,
    source text DEFAULT 'checkin'::text NOT NULL,
    venue_name text,
    checkin_date date,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL
);


--
-- Name: squad_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.squad_codes (
    id integer NOT NULL,
    squad_id text NOT NULL,
    code text NOT NULL,
    app_slug text DEFAULT 'squadd'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: squad_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.squad_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: squad_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.squad_codes_id_seq OWNED BY public.squad_codes.id;


--
-- Name: squad_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.squad_invites (
    id integer NOT NULL,
    squad_id text,
    inviter_id text NOT NULL,
    invitee_id text,
    invitee_name text,
    invite_channel text DEFAULT 'push'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    pod_id text,
    invite_type text DEFAULT 'gang'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at timestamp(3) without time zone,
    last_resent_at timestamp(3) without time zone
);


--
-- Name: squad_invites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.squad_invites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: squad_invites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.squad_invites_id_seq OWNED BY public.squad_invites.id;


--
-- Name: squad_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.squad_members (
    id integer NOT NULL,
    squad_id text NOT NULL,
    profile_id text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    joined_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    left_at timestamp(3) without time zone
);


--
-- Name: squad_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.squad_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: squad_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.squad_members_id_seq OWNED BY public.squad_members.id;


--
-- Name: squad_waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.squad_waitlist (
    id integer NOT NULL,
    squad_name text NOT NULL,
    emoji text NOT NULL,
    friend_count integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    country text NOT NULL,
    city text NOT NULL,
    profile_id text,
    player_name text,
    player_email text,
    player_dupr numeric(5,3)
);


--
-- Name: squad_waitlist_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.squad_waitlist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: squad_waitlist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.squad_waitlist_id_seq OWNED BY public.squad_waitlist.id;


--
-- Name: squad_xp_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.squad_xp_log (
    id integer NOT NULL,
    squad_id text NOT NULL,
    profile_id text,
    source text NOT NULL,
    xp_amount integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: squad_xp_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.squad_xp_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: squad_xp_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.squad_xp_log_id_seq OWNED BY public.squad_xp_log.id;


--
-- Name: squads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.squads (
    id text NOT NULL,
    name text NOT NULL,
    emoji text NOT NULL,
    color text NOT NULL,
    is_public boolean DEFAULT true NOT NULL,
    show_dupr boolean DEFAULT true NOT NULL,
    app_slug text DEFAULT 'squadd'::text NOT NULL,
    founder_id text NOT NULL,
    total_xp integer DEFAULT 0 NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    city text DEFAULT 'hcm'::text NOT NULL,
    streak_days integer DEFAULT 0 NOT NULL,
    streak_last_updated date,
    latitude double precision,
    longitude double precision,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    disbanded_at timestamp(3) without time zone
);


--
-- Name: token_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_ledger (
    id integer NOT NULL,
    profile_id text NOT NULL,
    token_type text NOT NULL,
    delta integer NOT NULL,
    reason text NOT NULL,
    squad_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: token_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.token_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: token_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.token_ledger_id_seq OWNED BY public.token_ledger.id;


--
-- Name: venue_inf_totals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_inf_totals (
    squad_id text NOT NULL,
    venue_id integer NOT NULL,
    total_inf integer DEFAULT 0 NOT NULL,
    last_updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: venue_pulse_cooldowns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_pulse_cooldowns (
    player_id text NOT NULL,
    venue_id integer NOT NULL,
    last_pulse_at timestamp(3) without time zone NOT NULL,
    cooldown_ends_at timestamp(3) without time zone NOT NULL
);


--
-- Name: venues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venues (
    id integer NOT NULL,
    name text NOT NULL,
    address text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: venues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.venues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: venues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.venues_id_seq OWNED BY public.venues.id;


--
-- Name: access_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_codes ALTER COLUMN id SET DEFAULT nextval('public.access_codes_id_seq'::regclass);


--
-- Name: club_daily_stats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_daily_stats ALTER COLUMN id SET DEFAULT nextval('public.club_daily_stats_id_seq'::regclass);


--
-- Name: clubs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clubs ALTER COLUMN id SET DEFAULT nextval('public.clubs_id_seq'::regclass);


--
-- Name: daily_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_snapshots ALTER COLUMN id SET DEFAULT nextval('public.daily_snapshots_id_seq'::regclass);


--
-- Name: follows id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows ALTER COLUMN id SET DEFAULT nextval('public.follows_id_seq'::regclass);


--
-- Name: kudos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kudos ALTER COLUMN id SET DEFAULT nextval('public.kudos_id_seq'::regclass);


--
-- Name: notifications_sent id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications_sent ALTER COLUMN id SET DEFAULT nextval('public.notifications_sent_id_seq'::regclass);


--
-- Name: player_dupr_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_dupr_history ALTER COLUMN id SET DEFAULT nextval('public.player_dupr_history_id_seq'::regclass);


--
-- Name: pod_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_members ALTER COLUMN id SET DEFAULT nextval('public.pod_members_id_seq'::regclass);


--
-- Name: session_rosters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_rosters ALTER COLUMN id SET DEFAULT nextval('public.session_rosters_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);


--
-- Name: squad_chest_openings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_chest_openings ALTER COLUMN id SET DEFAULT nextval('public.squad_chest_openings_id_seq'::regclass);


--
-- Name: squad_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_codes ALTER COLUMN id SET DEFAULT nextval('public.squad_codes_id_seq'::regclass);


--
-- Name: squad_invites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_invites ALTER COLUMN id SET DEFAULT nextval('public.squad_invites_id_seq'::regclass);


--
-- Name: squad_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_members ALTER COLUMN id SET DEFAULT nextval('public.squad_members_id_seq'::regclass);


--
-- Name: squad_waitlist id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_waitlist ALTER COLUMN id SET DEFAULT nextval('public.squad_waitlist_id_seq'::regclass);


--
-- Name: squad_xp_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_xp_log ALTER COLUMN id SET DEFAULT nextval('public.squad_xp_log_id_seq'::regclass);


--
-- Name: token_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_ledger ALTER COLUMN id SET DEFAULT nextval('public.token_ledger_id_seq'::regclass);


--
-- Name: venues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues ALTER COLUMN id SET DEFAULT nextval('public.venues_id_seq'::regclass);


--
-- Name: access_codes access_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_codes
    ADD CONSTRAINT access_codes_pkey PRIMARY KEY (id);


--
-- Name: admin_settings admin_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_settings
    ADD CONSTRAINT admin_settings_pkey PRIMARY KEY (id);


--
-- Name: ai_assistant_logs ai_assistant_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_assistant_logs
    ADD CONSTRAINT ai_assistant_logs_pkey PRIMARY KEY (id);


--
-- Name: ai_chat_settings ai_chat_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chat_settings
    ADD CONSTRAINT ai_chat_settings_pkey PRIMARY KEY (id);


--
-- Name: app_club_managers app_club_managers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_club_managers
    ADD CONSTRAINT app_club_managers_pkey PRIMARY KEY (id);


--
-- Name: app_club_members app_club_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_club_members
    ADD CONSTRAINT app_club_members_pkey PRIMARY KEY (id);


--
-- Name: app_clubs app_clubs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_clubs
    ADD CONSTRAINT app_clubs_pkey PRIMARY KEY (id);


--
-- Name: auth_accounts auth_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_accounts
    ADD CONSTRAINT auth_accounts_pkey PRIMARY KEY (id);


--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);


--
-- Name: auth_users auth_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_users
    ADD CONSTRAINT auth_users_pkey PRIMARY KEY (id);


--
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (id);


--
-- Name: card_battles card_battles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_battles
    ADD CONSTRAINT card_battles_pkey PRIMARY KEY (id);


--
-- Name: club_daily_stats club_daily_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_daily_stats
    ADD CONSTRAINT club_daily_stats_pkey PRIMARY KEY (id);


--
-- Name: club_session_bookings club_session_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_session_bookings
    ADD CONSTRAINT club_session_bookings_pkey PRIMARY KEY (id);


--
-- Name: club_sessions club_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_sessions
    ADD CONSTRAINT club_sessions_pkey PRIMARY KEY (id);


--
-- Name: clubs clubs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_pkey PRIMARY KEY (id);


--
-- Name: content_posts content_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_posts
    ADD CONSTRAINT content_posts_pkey PRIMARY KEY (id);


--
-- Name: daily_snapshots daily_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_snapshots
    ADD CONSTRAINT daily_snapshots_pkey PRIMARY KEY (id);


--
-- Name: feed_items feed_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_items
    ADD CONSTRAINT feed_items_pkey PRIMARY KEY (id);


--
-- Name: follows follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_pkey PRIMARY KEY (id);


--
-- Name: hcm_market_median_daily hcm_market_median_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcm_market_median_daily
    ADD CONSTRAINT hcm_market_median_daily_pkey PRIMARY KEY (date);


--
-- Name: kudos kudos_from_player_id_to_player_id_type_feed_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kudos
    ADD CONSTRAINT kudos_from_player_id_to_player_id_type_feed_item_id_key UNIQUE (from_player_id, to_player_id, type, feed_item_id);


--
-- Name: kudos kudos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kudos
    ADD CONSTRAINT kudos_pkey PRIMARY KEY (id);


--
-- Name: llm_usage_logs llm_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_usage_logs
    ADD CONSTRAINT llm_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: notifications_sent notifications_sent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications_sent
    ADD CONSTRAINT notifications_sent_pkey PRIMARY KEY (id);


--
-- Name: play_intents play_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.play_intents
    ADD CONSTRAINT play_intents_pkey PRIMARY KEY (id);


--
-- Name: player_brands player_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_brands
    ADD CONSTRAINT player_brands_pkey PRIMARY KEY (id);


--
-- Name: player_dupr_history player_dupr_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_dupr_history
    ADD CONSTRAINT player_dupr_history_pkey PRIMARY KEY (id);


--
-- Name: player_gear player_gear_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_gear
    ADD CONSTRAINT player_gear_pkey PRIMARY KEY (id);


--
-- Name: player_profiles player_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_profiles
    ADD CONSTRAINT player_profiles_pkey PRIMARY KEY (id);


--
-- Name: player_wallets player_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_wallets
    ADD CONSTRAINT player_wallets_pkey PRIMARY KEY (id);


--
-- Name: players players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (user_id);


--
-- Name: pod_members pod_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_members
    ADD CONSTRAINT pod_members_pkey PRIMARY KEY (id);


--
-- Name: pods pods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pods
    ADD CONSTRAINT pods_pkey PRIMARY KEY (id);


--
-- Name: radar_sessions radar_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radar_sessions
    ADD CONSTRAINT radar_sessions_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: session_dupr_stats session_dupr_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_dupr_stats
    ADD CONSTRAINT session_dupr_stats_pkey PRIMARY KEY (session_id);


--
-- Name: session_rosters session_rosters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_rosters
    ADD CONSTRAINT session_rosters_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: squad_alerts squad_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_alerts
    ADD CONSTRAINT squad_alerts_pkey PRIMARY KEY (id);


--
-- Name: squad_card_state squad_card_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_card_state
    ADD CONSTRAINT squad_card_state_pkey PRIMARY KEY (squad_id);


--
-- Name: squad_chest_openings squad_chest_openings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_chest_openings
    ADD CONSTRAINT squad_chest_openings_pkey PRIMARY KEY (id);


--
-- Name: squad_chests squad_chests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_chests
    ADD CONSTRAINT squad_chests_pkey PRIMARY KEY (id);


--
-- Name: squad_codes squad_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_codes
    ADD CONSTRAINT squad_codes_pkey PRIMARY KEY (id);


--
-- Name: squad_invites squad_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_invites
    ADD CONSTRAINT squad_invites_pkey PRIMARY KEY (id);


--
-- Name: squad_members squad_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_members
    ADD CONSTRAINT squad_members_pkey PRIMARY KEY (id);


--
-- Name: squad_waitlist squad_waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_waitlist
    ADD CONSTRAINT squad_waitlist_pkey PRIMARY KEY (id);


--
-- Name: squad_xp_log squad_xp_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_xp_log
    ADD CONSTRAINT squad_xp_log_pkey PRIMARY KEY (id);


--
-- Name: squads squads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squads
    ADD CONSTRAINT squads_pkey PRIMARY KEY (id);


--
-- Name: token_ledger token_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_ledger
    ADD CONSTRAINT token_ledger_pkey PRIMARY KEY (id);


--
-- Name: venue_inf_totals venue_inf_totals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_inf_totals
    ADD CONSTRAINT venue_inf_totals_pkey PRIMARY KEY (squad_id, venue_id);


--
-- Name: venue_pulse_cooldowns venue_pulse_cooldowns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_pulse_cooldowns
    ADD CONSTRAINT venue_pulse_cooldowns_pkey PRIMARY KEY (player_id, venue_id);


--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_pkey PRIMARY KEY (id);


--
-- Name: access_codes_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX access_codes_code_key ON public.access_codes USING btree (code);


--
-- Name: ai_assistant_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_assistant_logs_created_at_idx ON public.ai_assistant_logs USING btree (created_at);


--
-- Name: ai_assistant_logs_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_assistant_logs_session_id_idx ON public.ai_assistant_logs USING btree (session_id);


--
-- Name: ai_assistant_logs_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_assistant_logs_source_idx ON public.ai_assistant_logs USING btree (source);


--
-- Name: app_club_managers_app_club_id_player_profile_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_club_managers_app_club_id_player_profile_id_key ON public.app_club_managers USING btree (app_club_id, player_profile_id);


--
-- Name: app_club_managers_player_profile_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_club_managers_player_profile_id_idx ON public.app_club_managers USING btree (player_profile_id);


--
-- Name: app_club_members_app_club_id_player_profile_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_club_members_app_club_id_player_profile_id_key ON public.app_club_members USING btree (app_club_id, player_profile_id);


--
-- Name: app_club_members_player_profile_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_club_members_player_profile_id_idx ON public.app_club_members USING btree (player_profile_id);


--
-- Name: app_clubs_creator_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_clubs_creator_id_key ON public.app_clubs USING btree (creator_id);


--
-- Name: app_clubs_privacy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_clubs_privacy_idx ON public.app_clubs USING btree (privacy);


--
-- Name: auth_accounts_provider_provider_account_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_accounts_provider_provider_account_id_key ON public.auth_accounts USING btree (provider, provider_account_id);


--
-- Name: auth_sessions_session_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_sessions_session_token_key ON public.auth_sessions USING btree (session_token);


--
-- Name: auth_users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_users_email_key ON public.auth_users USING btree (email);


--
-- Name: auth_verification_tokens_identifier_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_verification_tokens_identifier_token_key ON public.auth_verification_tokens USING btree (identifier, token);


--
-- Name: auth_verification_tokens_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_verification_tokens_token_key ON public.auth_verification_tokens USING btree (token);


--
-- Name: blocks_blocked_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blocks_blocked_id_idx ON public.blocks USING btree (blocked_id);


--
-- Name: blocks_blocker_id_blocked_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX blocks_blocker_id_blocked_id_key ON public.blocks USING btree (blocker_id, blocked_id);


--
-- Name: blocks_blocker_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blocks_blocker_id_idx ON public.blocks USING btree (blocker_id);


--
-- Name: card_battles_initiating_squad_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_battles_initiating_squad_id_idx ON public.card_battles USING btree (initiating_squad_id);


--
-- Name: card_battles_rival_squad_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_battles_rival_squad_id_idx ON public.card_battles USING btree (rival_squad_id);


--
-- Name: card_battles_venue_id_initiated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_battles_venue_id_initiated_at_idx ON public.card_battles USING btree (venue_id, initiated_at);


--
-- Name: club_daily_stats_club_id_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX club_daily_stats_club_id_date_key ON public.club_daily_stats USING btree (club_id, date);


--
-- Name: club_daily_stats_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX club_daily_stats_date_idx ON public.club_daily_stats USING btree (date);


--
-- Name: club_session_bookings_club_session_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX club_session_bookings_club_session_id_status_idx ON public.club_session_bookings USING btree (club_session_id, status);


--
-- Name: club_session_bookings_player_profile_id_club_session_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX club_session_bookings_player_profile_id_club_session_id_key ON public.club_session_bookings USING btree (player_profile_id, club_session_id);


--
-- Name: club_session_bookings_player_profile_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX club_session_bookings_player_profile_id_idx ON public.club_session_bookings USING btree (player_profile_id);


--
-- Name: club_sessions_app_club_id_start_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX club_sessions_app_club_id_start_time_idx ON public.club_sessions USING btree (app_club_id, start_time);


--
-- Name: club_sessions_lifecycle_state_start_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX club_sessions_lifecycle_state_start_time_idx ON public.club_sessions USING btree (lifecycle_state, start_time);


--
-- Name: club_sessions_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX club_sessions_venue_id_idx ON public.club_sessions USING btree (venue_id);


--
-- Name: clubs_reclub_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clubs_reclub_id_key ON public.clubs USING btree (reclub_id);


--
-- Name: clubs_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clubs_slug_key ON public.clubs USING btree (slug);


--
-- Name: content_posts_scheduled_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_posts_scheduled_date_idx ON public.content_posts USING btree (scheduled_date);


--
-- Name: content_posts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_posts_status_idx ON public.content_posts USING btree (status);


--
-- Name: daily_snapshots_scraped_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX daily_snapshots_scraped_at_idx ON public.daily_snapshots USING btree (scraped_at);


--
-- Name: daily_snapshots_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX daily_snapshots_session_id_idx ON public.daily_snapshots USING btree (session_id);


--
-- Name: feed_items_profile_id_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feed_items_profile_id_timestamp_idx ON public.feed_items USING btree (profile_id, "timestamp" DESC);


--
-- Name: feed_items_profile_id_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feed_items_profile_id_type_idx ON public.feed_items USING btree (profile_id, type);


--
-- Name: follows_followee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follows_followee_id_idx ON public.follows USING btree (followee_id);


--
-- Name: follows_follower_id_followee_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX follows_follower_id_followee_id_key ON public.follows USING btree (follower_id, followee_id);


--
-- Name: follows_follower_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follows_follower_id_idx ON public.follows USING btree (follower_id);


--
-- Name: kudos_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kudos_from_idx ON public.kudos USING btree (from_player_id, created_at);


--
-- Name: kudos_from_player_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kudos_from_player_id_created_at_idx ON public.kudos USING btree (from_player_id, created_at);


--
-- Name: kudos_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kudos_to_idx ON public.kudos USING btree (to_player_id, type);


--
-- Name: kudos_to_player_id_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kudos_to_player_id_type_idx ON public.kudos USING btree (to_player_id, type);


--
-- Name: llm_usage_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX llm_usage_logs_created_at_idx ON public.llm_usage_logs USING btree (created_at);


--
-- Name: notifications_sent_recipient_id_type_sent_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_sent_recipient_id_type_sent_at_idx ON public.notifications_sent USING btree (recipient_id, type, sent_at);


--
-- Name: play_intents_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX play_intents_expires_at_idx ON public.play_intents USING btree (expires_at);


--
-- Name: play_intents_profile_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX play_intents_profile_id_key ON public.play_intents USING btree (profile_id);


--
-- Name: player_brands_profile_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_brands_profile_id_key ON public.player_brands USING btree (profile_id);


--
-- Name: player_dupr_history_player_id_recorded_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_dupr_history_player_id_recorded_at_idx ON public.player_dupr_history USING btree (player_id, recorded_at);


--
-- Name: player_gear_profile_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_gear_profile_id_key ON public.player_gear USING btree (profile_id);


--
-- Name: player_profiles_reclub_user_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_profiles_reclub_user_id_key ON public.player_profiles USING btree (reclub_user_id);


--
-- Name: player_profiles_squad_nickname_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_profiles_squad_nickname_key ON public.player_profiles USING btree (squad_nickname);


--
-- Name: player_profiles_user_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_profiles_user_id_key ON public.player_profiles USING btree (user_id);


--
-- Name: player_profiles_zalo_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_profiles_zalo_id_key ON public.player_profiles USING btree (zalo_id);


--
-- Name: player_wallets_profile_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_wallets_profile_id_key ON public.player_wallets USING btree (profile_id);


--
-- Name: pod_members_pod_id_profile_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pod_members_pod_id_profile_id_key ON public.pod_members USING btree (pod_id, profile_id);


--
-- Name: pod_members_profile_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pod_members_profile_id_idx ON public.pod_members USING btree (profile_id);


--
-- Name: pods_founder_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pods_founder_id_idx ON public.pods USING btree (founder_id);


--
-- Name: pods_squad_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pods_squad_id_idx ON public.pods USING btree (squad_id);


--
-- Name: radar_sessions_auto_ends_at_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radar_sessions_auto_ends_at_state_idx ON public.radar_sessions USING btree (auto_ends_at, state);


--
-- Name: radar_sessions_player_id_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radar_sessions_player_id_state_idx ON public.radar_sessions USING btree (player_id, state);


--
-- Name: radar_sessions_squad_id_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radar_sessions_squad_id_state_idx ON public.radar_sessions USING btree (squad_id, state);


--
-- Name: radar_sessions_venue_id_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX radar_sessions_venue_id_state_idx ON public.radar_sessions USING btree (venue_id, state);


--
-- Name: reports_reported_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_reported_id_idx ON public.reports USING btree (reported_id);


--
-- Name: reports_reporter_id_reported_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reports_reporter_id_reported_id_key ON public.reports USING btree (reporter_id, reported_id);


--
-- Name: reports_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_status_idx ON public.reports USING btree (status);


--
-- Name: session_rosters_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_rosters_session_id_idx ON public.session_rosters USING btree (session_id);


--
-- Name: session_rosters_session_id_user_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX session_rosters_session_id_user_id_key ON public.session_rosters USING btree (session_id, user_id);


--
-- Name: session_rosters_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_rosters_user_id_idx ON public.session_rosters USING btree (user_id);


--
-- Name: sessions_club_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_club_id_idx ON public.sessions USING btree (club_id);


--
-- Name: sessions_reference_code_scraped_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sessions_reference_code_scraped_date_key ON public.sessions USING btree (reference_code, scraped_date);


--
-- Name: sessions_scraped_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_scraped_date_idx ON public.sessions USING btree (scraped_date);


--
-- Name: sessions_scraped_date_status_start_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_scraped_date_status_start_time_idx ON public.sessions USING btree (scraped_date, status, start_time);


--
-- Name: sessions_start_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_start_time_idx ON public.sessions USING btree (start_time);


--
-- Name: sessions_venue_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_venue_id_idx ON public.sessions USING btree (venue_id);


--
-- Name: squad_alerts_recipient_profile_id_read_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX squad_alerts_recipient_profile_id_read_at_idx ON public.squad_alerts USING btree (recipient_profile_id, read_at);


--
-- Name: squad_alerts_squad_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX squad_alerts_squad_id_created_at_idx ON public.squad_alerts USING btree (squad_id, created_at);


--
-- Name: squad_chest_openings_chest_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX squad_chest_openings_chest_id_idx ON public.squad_chest_openings USING btree (chest_id);


--
-- Name: squad_chest_openings_chest_id_profile_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX squad_chest_openings_chest_id_profile_id_key ON public.squad_chest_openings USING btree (chest_id, profile_id);


--
-- Name: squad_chest_openings_profile_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX squad_chest_openings_profile_id_idx ON public.squad_chest_openings USING btree (profile_id);


--
-- Name: squad_chest_openings_unlocks_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX squad_chest_openings_unlocks_at_idx ON public.squad_chest_openings USING btree (unlocks_at);


--
-- Name: squad_chests_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX squad_chests_expires_at_idx ON public.squad_chests USING btree (expires_at);


--
-- Name: squad_chests_squad_id_earner_id_checkin_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX squad_chests_squad_id_earner_id_checkin_date_key ON public.squad_chests USING btree (squad_id, earner_id, checkin_date);


--
-- Name: squad_chests_squad_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX squad_chests_squad_id_idx ON public.squad_chests USING btree (squad_id);


--
-- Name: squad_codes_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX squad_codes_code_key ON public.squad_codes USING btree (code);


--
-- Name: squad_codes_squad_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX squad_codes_squad_id_key ON public.squad_codes USING btree (squad_id);


--
-- Name: squad_invites_invitee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX squad_invites_invitee_id_idx ON public.squad_invites USING btree (invitee_id);


--
-- Name: squad_invites_pod_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX squad_invites_pod_id_idx ON public.squad_invites USING btree (pod_id);


--
-- Name: squad_invites_squad_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX squad_invites_squad_id_idx ON public.squad_invites USING btree (squad_id);


--
-- Name: squad_members_profile_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX squad_members_profile_id_idx ON public.squad_members USING btree (profile_id);


--
-- Name: squad_members_squad_id_profile_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX squad_members_squad_id_profile_id_key ON public.squad_members USING btree (squad_id, profile_id);


--
-- Name: squad_xp_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX squad_xp_log_created_at_idx ON public.squad_xp_log USING btree (created_at);


--
-- Name: squad_xp_log_squad_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX squad_xp_log_squad_id_idx ON public.squad_xp_log USING btree (squad_id);


--
-- Name: squads_founder_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX squads_founder_id_idx ON public.squads USING btree (founder_id);


--
-- Name: squads_latitude_longitude_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX squads_latitude_longitude_idx ON public.squads USING btree (latitude, longitude);


--
-- Name: token_ledger_profile_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX token_ledger_profile_id_created_at_idx ON public.token_ledger USING btree (profile_id, created_at);


--
-- Name: venue_inf_totals_venue_id_total_inf_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venue_inf_totals_venue_id_total_inf_idx ON public.venue_inf_totals USING btree (venue_id, total_inf DESC);


--
-- Name: venues_latitude_longitude_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX venues_latitude_longitude_idx ON public.venues USING btree (latitude, longitude);


--
-- Name: access_codes access_codes_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_codes
    ADD CONSTRAINT access_codes_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: access_codes access_codes_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_codes
    ADD CONSTRAINT access_codes_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: app_club_managers app_club_managers_added_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_club_managers
    ADD CONSTRAINT app_club_managers_added_by_id_fkey FOREIGN KEY (added_by_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: app_club_managers app_club_managers_app_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_club_managers
    ADD CONSTRAINT app_club_managers_app_club_id_fkey FOREIGN KEY (app_club_id) REFERENCES public.app_clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: app_club_managers app_club_managers_player_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_club_managers
    ADD CONSTRAINT app_club_managers_player_profile_id_fkey FOREIGN KEY (player_profile_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: app_club_members app_club_members_app_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_club_members
    ADD CONSTRAINT app_club_members_app_club_id_fkey FOREIGN KEY (app_club_id) REFERENCES public.app_clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: app_club_members app_club_members_player_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_club_members
    ADD CONSTRAINT app_club_members_player_profile_id_fkey FOREIGN KEY (player_profile_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: app_clubs app_clubs_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_clubs
    ADD CONSTRAINT app_clubs_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: auth_accounts auth_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_accounts
    ADD CONSTRAINT auth_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: auth_sessions auth_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: blocks blocks_blocked_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: blocks blocks_blocker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: card_battles card_battles_initiating_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_battles
    ADD CONSTRAINT card_battles_initiating_squad_id_fkey FOREIGN KEY (initiating_squad_id) REFERENCES public.squads(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: card_battles card_battles_rival_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_battles
    ADD CONSTRAINT card_battles_rival_squad_id_fkey FOREIGN KEY (rival_squad_id) REFERENCES public.squads(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: card_battles card_battles_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_battles
    ADD CONSTRAINT card_battles_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: club_daily_stats club_daily_stats_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_daily_stats
    ADD CONSTRAINT club_daily_stats_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: club_session_bookings club_session_bookings_club_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_session_bookings
    ADD CONSTRAINT club_session_bookings_club_session_id_fkey FOREIGN KEY (club_session_id) REFERENCES public.club_sessions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: club_session_bookings club_session_bookings_player_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_session_bookings
    ADD CONSTRAINT club_session_bookings_player_profile_id_fkey FOREIGN KEY (player_profile_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: club_sessions club_sessions_app_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_sessions
    ADD CONSTRAINT club_sessions_app_club_id_fkey FOREIGN KEY (app_club_id) REFERENCES public.app_clubs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: club_sessions club_sessions_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_sessions
    ADD CONSTRAINT club_sessions_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: club_sessions club_sessions_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_sessions
    ADD CONSTRAINT club_sessions_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: daily_snapshots daily_snapshots_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_snapshots
    ADD CONSTRAINT daily_snapshots_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: feed_items feed_items_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_items
    ADD CONSTRAINT feed_items_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: follows follows_followee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_followee_id_fkey FOREIGN KEY (followee_id) REFERENCES public.players(user_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: follows follows_follower_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notifications_sent notifications_sent_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications_sent
    ADD CONSTRAINT notifications_sent_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notifications_sent notifications_sent_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications_sent
    ADD CONSTRAINT notifications_sent_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: play_intents play_intents_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.play_intents
    ADD CONSTRAINT play_intents_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_brands player_brands_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_brands
    ADD CONSTRAINT player_brands_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: player_dupr_history player_dupr_history_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_dupr_history
    ADD CONSTRAINT player_dupr_history_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(user_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_gear player_gear_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_gear
    ADD CONSTRAINT player_gear_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: player_profiles player_profiles_reclub_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_profiles
    ADD CONSTRAINT player_profiles_reclub_user_id_fkey FOREIGN KEY (reclub_user_id) REFERENCES public.players(user_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: player_profiles player_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_profiles
    ADD CONSTRAINT player_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: player_wallets player_wallets_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_wallets
    ADD CONSTRAINT player_wallets_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: pod_members pod_members_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_members
    ADD CONSTRAINT pod_members_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: pod_members pod_members_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_members
    ADD CONSTRAINT pod_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: pods pods_founder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pods
    ADD CONSTRAINT pods_founder_id_fkey FOREIGN KEY (founder_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: pods pods_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pods
    ADD CONSTRAINT pods_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.squads(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: radar_sessions radar_sessions_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radar_sessions
    ADD CONSTRAINT radar_sessions_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: radar_sessions radar_sessions_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radar_sessions
    ADD CONSTRAINT radar_sessions_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.squads(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: radar_sessions radar_sessions_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radar_sessions
    ADD CONSTRAINT radar_sessions_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: reports reports_reported_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reported_id_fkey FOREIGN KEY (reported_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: reports reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: session_dupr_stats session_dupr_stats_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_dupr_stats
    ADD CONSTRAINT session_dupr_stats_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: session_rosters session_rosters_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_rosters
    ADD CONSTRAINT session_rosters_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: session_rosters session_rosters_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_rosters
    ADD CONSTRAINT session_rosters_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.players(user_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sessions sessions_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sessions sessions_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: squad_alerts squad_alerts_recipient_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_alerts
    ADD CONSTRAINT squad_alerts_recipient_profile_id_fkey FOREIGN KEY (recipient_profile_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: squad_alerts squad_alerts_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_alerts
    ADD CONSTRAINT squad_alerts_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.squads(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: squad_card_state squad_card_state_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_card_state
    ADD CONSTRAINT squad_card_state_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.squads(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: squad_chest_openings squad_chest_openings_chest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_chest_openings
    ADD CONSTRAINT squad_chest_openings_chest_id_fkey FOREIGN KEY (chest_id) REFERENCES public.squad_chests(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: squad_chest_openings squad_chest_openings_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_chest_openings
    ADD CONSTRAINT squad_chest_openings_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: squad_chests squad_chests_earner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_chests
    ADD CONSTRAINT squad_chests_earner_id_fkey FOREIGN KEY (earner_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: squad_chests squad_chests_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_chests
    ADD CONSTRAINT squad_chests_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.squads(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: squad_codes squad_codes_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_codes
    ADD CONSTRAINT squad_codes_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.squads(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: squad_invites squad_invites_inviter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_invites
    ADD CONSTRAINT squad_invites_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: squad_invites squad_invites_pod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_invites
    ADD CONSTRAINT squad_invites_pod_id_fkey FOREIGN KEY (pod_id) REFERENCES public.pods(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: squad_invites squad_invites_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_invites
    ADD CONSTRAINT squad_invites_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.squads(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: squad_members squad_members_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_members
    ADD CONSTRAINT squad_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: squad_members squad_members_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_members
    ADD CONSTRAINT squad_members_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.squads(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: squad_xp_log squad_xp_log_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squad_xp_log
    ADD CONSTRAINT squad_xp_log_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.squads(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: squads squads_founder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.squads
    ADD CONSTRAINT squads_founder_id_fkey FOREIGN KEY (founder_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: venue_inf_totals venue_inf_totals_squad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_inf_totals
    ADD CONSTRAINT venue_inf_totals_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES public.squads(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: venue_inf_totals venue_inf_totals_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_inf_totals
    ADD CONSTRAINT venue_inf_totals_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: venue_pulse_cooldowns venue_pulse_cooldowns_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_pulse_cooldowns
    ADD CONSTRAINT venue_pulse_cooldowns_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.player_profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: venue_pulse_cooldowns venue_pulse_cooldowns_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_pulse_cooldowns
    ADD CONSTRAINT venue_pulse_cooldowns_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--



-- migrate:down
-- Baseline cannot be rolled back. This migration represents the full schema
-- as it existed when switching from prisma migrate to dbmate (2026-07-06).
