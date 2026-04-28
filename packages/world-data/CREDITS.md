# GeoPolitik World Data — Credits & Attribution

## GeoNames

`test-world.json` is generated from the GeoNames geographical database by
[`apps/worldgen/scripts/fetch-test-cities.ts`](../../apps/worldgen/scripts/fetch-test-cities.ts).

- Source: <https://www.geonames.org/>
- Datasets used: `cities500.zip`, `countryInfo.txt`
- License: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)

Per the CC BY 4.0 terms, GeoNames is credited here and in `apps/web` (player-facing
credits page, shipping with Phase 9 onboarding). Any modifications made to the
upstream data — primarily filtering to a curated 75-country subset and merging in
the per-city efficiency multipliers from `city-bonuses.json` — are documented in
the fetch script.

## Multiplier overrides

`city-bonuses.json` contains per-city resource multipliers (oil, steel,
electronics, money) authored manually for the Phase 2 test fixture. The values
are gameplay-flavour tuning, not real-world economic data, and are licensed under
the same terms as the rest of this repository.

## Phase 1 replacement

The Phase 1 worldgen pipeline replaces this hand-curated test fixture with an
OSM-driven extraction. OSM data is © OpenStreetMap contributors and licensed
under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright);
attribution and license requirements will be tracked here when that work lands.
