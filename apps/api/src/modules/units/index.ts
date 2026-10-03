/**
 * Units module — what other modules may use.
 *
 * A unit's accreditation in force lives here, once (decisions/akreditasi-unit.md):
 * the public site, the EMIS and Dapodik exports and the SKHUN read it. So does
 * who heads a unit and signs its documents.
 */
export { currentAccreditations, type CurrentAccreditation } from './unit-accreditation.service';
export { findUnitHead } from './unit-head';
