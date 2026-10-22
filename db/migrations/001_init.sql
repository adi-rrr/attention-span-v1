-- Attention Span v1 — initial schema
-- Matches architecture.md domain model

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE platform_type AS ENUM (
  'instagram',
  'reddit',
  'substack',
  'youtube',
  'screenshot'
);

CREATE TYPE save_status AS ENUM (
  'created',
  'preview_ready',
  'understand_pending',
  'understand_done',
  'done',
  'archived',
  'deleted'
);

CREATE TYPE content_kind AS ENUM (
  'place',
  'content',
  'other'
);

CREATE TYPE offline_policy AS ENUM (
  'full',
  'light'
);

CREATE TYPE understand_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'skipped'
);

CREATE TYPE reminder_status AS ENUM (
  'scheduled',
  'sent',
  'cancelled'
);

CREATE TYPE reminder_created_from AS ENUM (
  'understand_answer',
  'manual'
);

CREATE TYPE reminder_delivery AS ENUM (
  'in_app',
  'calendar',
  'both'
);

CREATE TYPE calendar_provider AS ENUM (
  'apple',
  'google'
);

CREATE TYPE map_pin_source AS ENUM (
  'user_answer',
  'geocoded',
  'manual_adjust'
);

-- ---------------------------------------------------------------------------
-- Users & settings
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider_id text UNIQUE NOT NULL,  -- Clerk / Supabase subject
  email           text,
  display_name    text,
  timezone        text NOT NULL DEFAULT 'UTC',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TABLE user_settings (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  max_skips          int NOT NULL DEFAULT 2,
  skip_window_days   int NOT NULL DEFAULT 7,
  max_folder_depth   int NOT NULL DEFAULT 5,
  default_reminder_hour int NOT NULL DEFAULT 9,  -- local hour 0–23
  notifications_enabled boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Rolling skip usage (one row per skip event)
CREATE TABLE skip_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  save_id     uuid NOT NULL,  -- FK added after saves
  skipped_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX skip_events_user_time_idx ON skip_events (user_id, skipped_at DESC);

-- ---------------------------------------------------------------------------
-- Folders (Notion-like tree, max depth enforced in app / API)
-- ---------------------------------------------------------------------------

CREATE TABLE folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES folders(id) ON DELETE RESTRICT,
  name        text NOT NULL,
  depth       int NOT NULL CHECK (depth >= 1),
  path        text NOT NULL,  -- materialized: "Trips / Europe / Lisbon"
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT folders_root_depth CHECK (
    (parent_id IS NULL AND depth = 1) OR (parent_id IS NOT NULL AND depth > 1)
  )
);

CREATE INDEX folders_user_parent_idx ON folders (user_id, parent_id)
  WHERE deleted_at IS NULL;
CREATE INDEX folders_user_path_idx ON folders (user_id, path)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Saves
-- ---------------------------------------------------------------------------

CREATE TABLE saves (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id       uuid REFERENCES folders(id) ON DELETE SET NULL,
  platform        platform_type NOT NULL,
  source_url      text,
  title           text NOT NULL DEFAULT '',
  thumbnail_url   text,
  user_note       text,
  status          save_status NOT NULL DEFAULT 'created',
  content_kind    content_kind,
  offline_policy  offline_policy NOT NULL DEFAULT 'light',
  understand_text text NOT NULL DEFAULT '',  -- denormalized Q&A answers for search rebuild
  folder_path     text NOT NULL DEFAULT '',  -- denormalized folder.path for search
  search_document tsvector,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  -- Unique active source_url per user (for Replace / Cancel duplicate flow)
  CONSTRAINT saves_unique_url_per_user UNIQUE NULLS NOT DISTINCT (user_id, source_url)
);

-- Soft-deleted rows keep unique constraint issues: use partial unique instead
ALTER TABLE saves DROP CONSTRAINT saves_unique_url_per_user;

CREATE UNIQUE INDEX saves_user_source_url_active_idx
  ON saves (user_id, source_url)
  WHERE deleted_at IS NULL AND source_url IS NOT NULL AND source_url <> '';

CREATE INDEX saves_user_status_idx ON saves (user_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX saves_user_folder_idx ON saves (user_id, folder_id)
  WHERE deleted_at IS NULL;
CREATE INDEX saves_search_idx ON saves USING GIN (search_document);

ALTER TABLE skip_events
  ADD CONSTRAINT skip_events_save_fk
  FOREIGN KEY (save_id) REFERENCES saves(id) ON DELETE CASCADE;

-- Rebuild search_document: Understand (A) > note (B) > folder (C) > title+url (D)
CREATE OR REPLACE FUNCTION saves_rebuild_search_document()
RETURNS trigger AS $$
BEGIN
  NEW.search_document :=
    setweight(to_tsvector('english', coalesce(NEW.understand_text, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.user_note, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.folder_path, '')), 'C') ||
    setweight(
      to_tsvector(
        'english',
        coalesce(NEW.title, '') || ' ' || coalesce(NEW.source_url, '')
      ),
      'D'
    );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER saves_search_document_trg
  BEFORE INSERT OR UPDATE OF title, source_url, user_note, understand_text, folder_path
  ON saves
  FOR EACH ROW
  EXECUTE PROCEDURE saves_rebuild_search_document();

-- ---------------------------------------------------------------------------
-- Understand sessions
-- ---------------------------------------------------------------------------

CREATE TABLE understand_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id         uuid NOT NULL UNIQUE REFERENCES saves(id) ON DELETE CASCADE,
  status          understand_status NOT NULL DEFAULT 'pending',
  qa_pairs        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- qa_pairs: [{ "question": "...", "answer": "...", "asked_at": "...", "answered_at": "..." }]
  ai_turn_count   int NOT NULL DEFAULT 0 CHECK (ai_turn_count >= 0 AND ai_turn_count <= 4),
  completed_at    timestamptz,
  skipped_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------

CREATE TABLE reminders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id           uuid NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fire_at           timestamptz NOT NULL,
  timezone          text NOT NULL DEFAULT 'UTC',
  status            reminder_status NOT NULL DEFAULT 'scheduled',
  created_from      reminder_created_from NOT NULL DEFAULT 'manual',
  delivery          reminder_delivery NOT NULL DEFAULT 'in_app',
  calendar_provider calendar_provider,
  external_event_id text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX reminders_due_idx ON reminders (fire_at)
  WHERE status = 'scheduled' AND deleted_at IS NULL
    AND delivery IN ('in_app', 'both');

CREATE INDEX reminders_save_idx ON reminders (save_id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Map pins (place-intent)
-- ---------------------------------------------------------------------------

CREATE TABLE map_pins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  save_id     uuid NOT NULL UNIQUE REFERENCES saves(id) ON DELETE CASCADE,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  label       text NOT NULL DEFAULT '',
  source      map_pin_source NOT NULL DEFAULT 'manual_adjust',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX map_pins_geo_idx ON map_pins (lat, lng)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Sync metadata (multi-device conflict detection)
-- ---------------------------------------------------------------------------

CREATE TABLE sync_revisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type text NOT NULL,  -- 'save' | 'folder' | 'understand_session' | ...
  entity_id   uuid NOT NULL,
  revision    bigint NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX sync_revisions_user_idx ON sync_revisions (user_id, updated_at DESC);
