// Domain hooks
export * from "./use-students";
export * from "./use-regenerate-student-cards";
export * from "./use-units";
export * from "./use-users";
export * from "./use-classes";
export * from "./use-academic-years";
export * from "./use-teachers";
export * from "./use-attendance";
export * from "./use-tahfidz";
export * from "./use-dormitory";
export * from "./use-finance";
export * from "./use-permits";
export * from "./use-violations";
export * from "./use-rewards";
export * from "./use-health";
export * from "./use-inventory";
export * from "./use-library";
export * from "./use-dashboard";
export * from "./use-foundation";
export * from "./use-admissions";
export * from "./use-hr";
export * from "./use-departments";
export * from "./use-contracts";
export * from "./use-leave-balances";
export * from "./use-curriculum";
export * from "./use-kurikulum-merdeka";
export * from "./use-assessment";
export * from "./use-notifications";
export * from "./use-announcements";
export * from "./use-alumni";
export * from "./use-analytics";
export * from "./use-reports";
export * from "./use-roles";
export * from "./use-certificate";
export * from "./use-calendar";
export * from "./use-extracurricular";
export * from "./use-counseling";
export * from "./use-homeroom";
export * from "./use-report-card";
export * from "./use-duty-roster";
export * from "./use-meals";
export * from "./use-wilayah";
export * from "./use-student-compliance";
export * from "./use-teacher-compliance";
export * from "./use-takhosus";
export * from "./use-kitab-progress";
export * from "./use-ibadah";
export * from "./use-parent-portal";
export * from "./use-accounting";
export * from "./use-talenta";
export * from "./use-perencanaan";

// Utility hooks
export * from "./use-url-filters";
export * from "./use-debounce";
export * from "./use-unsaved-changes";
export * from "./use-keyboard-shortcuts";
export * from "./use-online-status";
export * from "./use-settings";

// Note: The following hooks are intentionally not re-exported from index
// due to naming conflicts with other hooks. Import them directly:
// - use-facilities (conflicts with use-dormitory: useRooms, CreateRoomData, etc.)
// - use-finance-enhancement (conflicts with use-finance: PAYMENT_METHODS, PaymentMethod)
// - use-muhadhoroh (conflicts with use-report-card: getGradeColor)
// - use-muhadatsah
// - use-muhasabah
// - use-donation (conflicts with use-finance: PAYMENT_METHODS, PaymentMethod)
// - use-wallet (conflicts with use-finance: PAYMENT_METHODS, PaymentMethod)
