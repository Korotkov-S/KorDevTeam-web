ALTER TABLE geo_experiments ADD COLUMN surface varchar(120);
--> statement-breakpoint
ALTER TABLE geo_experiments ADD COLUMN session_personalized boolean;
--> statement-breakpoint
ALTER TABLE geo_experiments ADD CONSTRAINT geo_experiments_surface_valid
  CHECK (surface IS NULL OR (length(btrim(surface)) > 0 AND surface !~ '[[:cntrl:]]'));
