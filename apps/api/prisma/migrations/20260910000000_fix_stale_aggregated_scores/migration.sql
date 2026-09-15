-- ============================================================================
-- Perbaiki skor evaluasi & skor agregat PK yang TERSIMPAN salah akibat migrasi
-- `20260905000000_indicator_aggregation`.
--
-- Migrasi itu hanya menghitung ulang `pk_indicators.realization`. Ia TIDAK
-- menyentuh `pk_evaluations.performance_score/overall_score` maupun skor
-- agregat `performance_agreements`. Karena evaluasi berstatus APPROVED tidak
-- lagi dapat disunting/di-approve ulang, skor lama (mis. "YTD 168 persen")
-- akan tampil selamanya di dashboard.
--
-- Langkah ini menghitung ulang untuk baris yang sudah salah:
--   1. `performance_score` tiap evaluasi APPROVED dari realisasi YTD yang benar
--      (sesuai `aggregation` indikator: KUMULATIF / RATA_RATA / TERAKHIR),
--   2. `overall_score` tiap evaluasi (60% hasil kerja + 40% perilaku),
--   3. `total_score`/`behavior_score`/`overall_score` agregat
--      `performance_agreements` dari evaluasi APPROVED periode terakhir
--      (perilaku diambil dari tersimpan, karena perilaku tidak terpengaruh
--      migrasi aggregation ini).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Capaian YTD per (evaluasi, indikator). Untuk tiap evaluasi APPROVED,
--    kumpulkan realisasi seluruh evaluasi APPROVED dengan periode <= periodenya
--    (termasuk evaluasi itu sendiri), terurut naik periode (urutan ini wajib
--    untuk mode TERAKHIR). PROPOSED TIDAK dihitung — sama persis dengan
--    `recalculateEvaluationScores` dan `syncToPKAndTalentInTx`: realisasinya
--    belum terkunci, jadi belum otoritatif. Migrasi yang menghitung dengan
--    aturan lain menulis skor yang tidak akan pernah dihasilkan aplikasinya.
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _perf_yield (
  evaluation_id    text,
  indicator_id     text,
  "target"         double precision,
  "weight"         double precision,
  aggregation      text,
  achieved         double precision
);

INSERT INTO _perf_yield (evaluation_id, indicator_id, "target", "weight", aggregation, achieved)
WITH vis AS (
  SELECT
    e.id                                AS evaluation_id,
    i.id                                AS indicator_id,
    i."target",
    i."weight",
    i."aggregation"::text               AS aggregation,
    ARRAY_AGG(ie."realization" ORDER BY e2."year", e2."month")
        FILTER (WHERE ie."realization" IS NOT NULL) AS vals
  FROM "pk_evaluations" e
  JOIN "pk_indicator_evaluations" eid ON eid."evaluation_id" = e.id
  JOIN "pk_indicators" i ON i.id = eid."indicator_id"
  LEFT JOIN "pk_evaluations" e2
         ON e2."pk_id" = e."pk_id"
        AND e2."status" = 'APPROVED'
        AND (e2."year" < e."year"
             OR (e2."year" = e."year" AND e2."month" <= e."month"))
  LEFT JOIN "pk_indicator_evaluations" ie
         ON ie."evaluation_id" = e2.id AND ie."indicator_id" = i.id
  WHERE e."status" = 'APPROVED'
  GROUP BY e.id, i.id, i."target", i."weight", i."aggregation"
)
SELECT
  vis.evaluation_id,
  vis.indicator_id,
  vis."target",
  vis."weight",
  vis.aggregation,
  CASE vis.aggregation
    WHEN 'RATA_RATA' THEN (SELECT AVG(t.v) FROM unnest(vis.vals) AS t(v))
    WHEN 'TERAKHIR'  THEN vis.vals[array_length(vis.vals, 1)]
    ELSE (SELECT SUM(t.v) FROM unnest(vis.vals) AS t(v))
  END AS achieved
FROM vis;

-- ----------------------------------------------------------------------------
-- 2. `performance_score` & `overall_score` tiap evaluasi APPROVED.
--    indScore dibanding target; performa = SUM(indScore * bobot / 100).
-- ----------------------------------------------------------------------------
UPDATE "pk_evaluations" e
   SET "performance_score" = s.performance_score,
       "overall_score"     = e."behavior_score" * 0.4
                             + s.performance_score * 0.6
  FROM (
    SELECT
      evaluation_id,
      SUM(
        CASE
          WHEN "target" > 0
            THEN LEAST(100, COALESCE(achieved, 0) / "target" * 100) * "weight" / 100
          WHEN "target" = 0 AND COALESCE(achieved, 0) = 0
            THEN "weight"
          ELSE 0
        END
      ) AS performance_score
    FROM _perf_yield
    GROUP BY evaluation_id
  ) s
 WHERE s.evaluation_id = e.id;

-- ----------------------------------------------------------------------------
-- 3. Skor agregat `performance_agreements` — dari evaluasi APPROVED periode
--    terakhir (konsisten dengan sinkronisasi PK: capaian YTD teragregasi),
--    perilaku diambil dari tersimpan.
-- ----------------------------------------------------------------------------
UPDATE "performance_agreements" pa
   SET "total_score"    = a."performance_score",
       "behavior_score" = a."behavior_score",
       "overall_score"  = a."overall_score"
  FROM (
    SELECT DISTINCT ON (e."pk_id")
           e."pk_id"              AS agreement_id,
           e."performance_score",
           e."behavior_score",
           e."overall_score"
      FROM "pk_evaluations" e
     WHERE e."status" = 'APPROVED'
     ORDER BY e."pk_id", e."year" DESC, e."month" DESC
  ) a
 WHERE a.agreement_id = pa.id;

DROP TABLE IF EXISTS _perf_yield;