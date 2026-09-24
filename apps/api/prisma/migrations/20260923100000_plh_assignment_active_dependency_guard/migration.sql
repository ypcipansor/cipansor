-- Preserve Plh/Plt delegation provenance for the lifetime of an ACTIVE suspension.
--
-- `board_suspension_plh_assignments.assignment_id` is `ON DELETE CASCADE`, so
-- deleting a `user_role_assignments` row takes the dependency row with it. That
-- dependency is the only place a suspension records whether it *created* the
-- assignment or merely reactivated one (and, if so, what state to restore). If
-- the row disappears while the suspension is still ACTIVE, the eventual lift
-- finds no provenance and cannot decide between "delete the delegation" and
-- "restore the prior state" — the delegation is either left active forever or
-- removed when it should have been restored.
--
-- The service refuses this delete explicitly, but a service check is only as
-- good as the writers that go through it. A `UserRoleAssignment` delete can
-- also arrive from a bulk admin path, a data-fix script, or a future module, so
-- the invariant is enforced where every writer must obey it: the database.
--
-- The rule: an assignment that an ACTIVE suspension depends on cannot be
-- deleted. Lifting the suspension sets its status to LIFTED (a status change,
-- not a delete) before the release runs in the same transaction, so the
-- suspension's own cleanup is never blocked by this trigger — by the time the
-- release deletes the row, no ACTIVE suspension references it.
--
-- `PERMANENT_DISMISSAL` is deliberately NOT treated as active here: it is a
-- terminal status like LIFTED, and a permanently dismissed officer's Plh
-- delegation is no longer needed to cover their office.
CREATE OR REPLACE FUNCTION assert_plh_assignment_not_in_active_suspension()
RETURNS TRIGGER AS $$
DECLARE
  dependent_sk text;
BEGIN
  SELECT s.sk_number
    INTO dependent_sk
    FROM "board_suspension_plh_assignments" d
    JOIN "board_member_suspensions" s ON s.id = d.suspension_id
   WHERE d.assignment_id = OLD.id
     AND s.status = 'ACTIVE'
   LIMIT 1;

  IF dependent_sk IS NOT NULL THEN
    RAISE EXCEPTION
      'Plh/Plt assignment % is still required by ACTIVE suspension %',
      OLD.id, dependent_sk
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_plh_assignment_active_dependency ON "user_role_assignments";

CREATE TRIGGER trg_plh_assignment_active_dependency
  BEFORE DELETE ON "user_role_assignments"
  FOR EACH ROW
  EXECUTE FUNCTION assert_plh_assignment_not_in_active_suspension();
