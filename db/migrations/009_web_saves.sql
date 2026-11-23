-- Web saves: any link (not just Instagram) and uploaded screenshots.
--
-- `pinterest` and `link` (any other web page) join the platform list.
-- Uploaded images live in save_images, one per screenshot save, together
-- with the text the AI read off them (that text is also the save's title,
-- so search and categories work the same as for links).

ALTER TYPE platform_type ADD VALUE IF NOT EXISTS 'pinterest';
ALTER TYPE platform_type ADD VALUE IF NOT EXISTS 'link';

CREATE TABLE IF NOT EXISTS save_images (
  save_id         uuid PRIMARY KEY REFERENCES saves(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime            text NOT NULL,
  data            bytea NOT NULL,
  extracted_text  text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);
