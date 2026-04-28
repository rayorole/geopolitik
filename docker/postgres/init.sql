-- Local dev only. Creates the worldgen database alongside the default app database.
-- The runtime app DB (geopolitik) does NOT use PostGIS; it stays portable to Neon.
-- The worldgen DB (geopolitik_worldgen) gets PostGIS for spatial precompute.

CREATE DATABASE geopolitik_worldgen OWNER geopolitik;

\connect geopolitik_worldgen
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
