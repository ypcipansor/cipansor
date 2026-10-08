/**
 * Mutation testing for the parts of apps/api where an untested branch has real
 * consequences: authentication, money, and admissions. It answers a different
 * question than coverage — not "was this line run?" but "would a test have
 * noticed if it behaved differently?" — so it catches suites that reach 100%
 * line coverage while asserting almost nothing.
 *
 * It is deliberately scoped to a small, curated list. Run it on a schedule
 * (.github/workflows/mutation.yml), never on every pull request: a full
 * mutation run is far too slow for the merge gate, and its value sits on the
 * critical paths, not on the whole tree. Add a file to `mutate` only after the
 * file has a focused unit test to kill its mutants; a file with no test just
 * reports a mutation score of zero and wastes the run.
 *
 * Local run:
 *   pnpm --filter api test:coverage          # once, to build the corpus
 *   pnpm --filter api mutation
 *
 * See docs/COVERAGE.md.
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],

  // The unit suites that import the curated services, pinned explicitly. Two
  // traps this avoids, both of which silently produce a 0% score:
  //   * `related: false` is required — related-mode resolves tests by import
  //     graph, and a service its tests import with `vi.mock` looks unrelated.
  //   * The test list is explicit rather than a second vitest config file: a
  //     relative `configFile` is not honoured inside Stryker's sandbox, so the
  //     full vitest.config.ts runs instead — including its two wall-clock
  //     timing tests, which are flaky and abort the dry run.
  // Grow `testFiles` together with `mutate`: a mutated file with no test here
  // reports 0% and wastes the run. finance.service.ts is absent for that reason.
  vitest: { related: false },
  testFiles: [
    'src/modules/auth/tests/password-must-change.test.ts',
    'src/modules/auth/tests/reset-link-scope.test.ts',
    'src/modules/auth/tests/second-factor-invite.test.ts',
    'src/modules/auth/tests/second-factor-roles.test.ts',
    'src/modules/auth/tests/session-follows-roles.test.ts',
    'src/modules/auth/tests/two-factor-codes.test.ts',
    'src/modules/admissions/tests/admissions.service.test.ts',
    'src/modules/admissions/tests/fees.test.ts',
    'src/modules/admissions/tests/intake.test.ts',
    'src/modules/admissions/tests/onboarding-wave.service.test.ts',
    'src/modules/admissions/tests/public-intakes.test.ts',
    'src/modules/admissions/tests/read-access.test.ts',
  ],

  // Curated critical-path files with focused unit tests. Grow slowly.
  mutate: ['src/modules/auth/auth.service.ts', 'src/modules/admissions/admissions.service.ts'],

  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: {
    // Below `break` the run fails, so the scheduled job turns red when the
    // assertions weaken. A post-run script compares the score against the last
    // recorded value (.github/mutation-baseline.json) and opens an issue on a
    // regression, mirroring the coverage ratchet.
    high: 80,
    low: 60,
    break: 50,
  },
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
  timeoutMS: 20000,
  concurrency: 4,
  // `off` runs every test suite for every mutant instead of the per-test subset
  // Stryker computes. That is the workaround, not a preference: the vitest
  // runner's per-test coverage analysis mislabels tests on vitest 5, so Stryker
  // filters the mutant run down to tests it thinks cover the mutant, runs none,
  // and scores 0% with every mutant "survived". `off` also forbids ignoreStatic,
  // so static mutants are included — slower, but the score is real.
  coverageAnalysis: 'off',
  disableBail: true,
  ignoreStatic: false,
};
