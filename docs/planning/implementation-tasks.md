# Implementation Tasks Breakdown - Cipansor Enhancement

**Version:** 2.0.0  
**Date:** December 11, 2025  
**Status:** Ready for Implementation  
**References:** requirements.md, database-design.md, backend-design.md, frontend-design.md, integration-testing-plan.md

---

## Executive Summary

### Project Status

- **Backend Completion:** 98% (62 modules implemented)
- **Frontend Completion:** 70% (60+ pages, needs UI/UX enhancement)
- **Database:** Complete (5,700+ lines Prisma schema)
- **Focus:** Frontend implementation + Integration testing + Polish

### Total Effort Estimation

- **PAUD Module:** 116 hours (14.5 days)
- **Tahfidz Enhancement:** 112 hours (14 days)
- **Multi-Unit Dashboard:** 88 hours (11 days)
- **Integration & Testing:** 80 hours (10 days)
- **Documentation & Deployment:** 24 hours (3 days)
- **GRAND TOTAL:** 420 hours (~53 days or ~10.5 weeks)

### Sprint Planning (2-week sprints)

- **Sprint 1-2:** PAUD Module (P1 - Critical)
- **Sprint 3-4:** Tahfidz Enhancement (P2 - High)
- **Sprint 5:** Multi-Unit Dashboard (P3 - Medium)
- **Sprint 6:** Integration Testing & Polish (P5 - Enhancement)

---

## Table of Contents

1. [PAUD Module Implementation](#1-paud-module-implementation) - 116h
2. [Tahfidz Enhancement Implementation](#2-tahfidz-enhancement-implementation) - 112h
3. [Multi-Unit Dashboard Implementation](#3-multi-unit-dashboard-implementation) - 88h
4. [Integration & Testing](#4-integration--testing) - 80h
5. [Documentation & Deployment](#5-documentation--deployment) - 24h

---

## 1. PAUD Module Implementation

**Total:** 116 hours | **Priority:** P1 (Critical) | **Sprint:** 1-2

### 1.1 PAUD Assessment List Page

**Route:** `/paud/assessment`  
**References:** [Req 4.1.1] [BE 2.1] [FE 2.1]  
**Estimated:** 8 hours

#### Tasks:

- [ ] 1.1.1 Create page layout with filters (student, aspect, period, date range)
  - File: `apps/web/src/app/(dashboard)/paud/assessment/page.tsx`
  - Components: SearchInput, DateRangePicker, Select (aspect/period)
  - **Time:** 2h

- [ ] 1.1.2 Implement data table with columns (student, aspect, level, date, actions)
  - Use shadcn/ui DataTable component
  - Add sorting, pagination (server-side)
  - **Time:** 2h

- [ ] 1.1.3 Add action buttons (View, Edit, Delete)
  - Create DropdownMenu for actions
  - Implement delete confirmation dialog
  - **Time:** 1h

- [ ] 1.1.4 Integrate with API using React Query
  - Hook: `useQuery(['assessments', filters])`
  - Endpoint: `GET /api/paud-assessment/assessments`
  - Handle loading, error states
  - **Time:** 1.5h

- [ ] 1.1.5 Write component unit tests
  - Test filter interactions
  - Test table rendering
  - Test action button clicks
  - **Time:** 1h

- [ ] 1.1.6 Run tests & verify
  - **Time:** 0.5h

**Dependencies:** Backend API exists (✅ complete)  
**Acceptance Criteria:**

- Filters work correctly with API
- Table displays paginated data
- Actions trigger correct modals/routes

---

### 1.2 PAUD Assessment Create/Edit Page

**Route:** `/paud/assessment/new`, `/paud/assessment/[id]/edit`  
**References:** [Req 4.1.2] [BE 2.1] [FE 2.2]  
**Estimated:** 12 hours

#### Tasks:

- [ ] 1.2.1 Create multi-step form layout
  - File: `apps/web/src/app/(dashboard)/paud/assessment/new/page.tsx`
  - Stepper component with 4 steps
  - Navigation buttons (Back, Next, Submit)
  - **Time:** 2h

- [ ] 1.2.2 Implement Step 1: Student Info
  - Autocomplete student select (search by name/NISN)
  - Period type radio (WEEKLY, MONTHLY, SEMESTER)
  - Academic year select (auto-default to current)
  - **Time:** 2h

- [ ] 1.2.3 Implement Step 2: Assessment Details
  - Aspect radio buttons (NAM, FM, KOG, BHS, SE, SNI)
  - Achievement level radio (BB, MB, BSH, BSB) with descriptions
  - Narrative textarea (min 50 chars)
  - Teacher notes textarea (optional)
  - **Time:** 2h

- [ ] 1.2.4 Implement Step 3: Evidence Upload
  - Multi-file upload (images/videos, max 5 files)
  - Drag & drop support
  - Preview thumbnails
  - Remove file functionality
  - **Time:** 2.5h

- [ ] 1.2.5 Implement Step 4: Review & Submit
  - Display summary of all inputs
  - Edit buttons to go back to specific steps
  - Submit button with loading state
  - **Time:** 1.5h

- [ ] 1.2.6 Integrate with React Hook Form & Zod validation
  - Define schema with validation rules
  - Handle form state across steps
  - Display validation errors
  - **Time:** 1h

- [ ] 1.2.7 Write component tests
  - Test step navigation
  - Test validation rules
  - Test file upload
  - **Time:** 0.5h

- [ ] 1.2.8 Run tests & verify
  - **Time:** 0.5h

**Dependencies:** 1.1  
**Acceptance Criteria:**

- Form validates correctly at each step
- File upload works with preview
- Submit creates assessment successfully
- User redirected to list page on success

---

### 1.3 PAUD Student Progress Dashboard

**Route:** `/paud/assessment/student/[id]/progress`  
**References:** [Req 4.1.3] [BE 2.1, 3.1] [FE 2.3]  
**Estimated:** 16 hours

#### Tasks:

- [ ] 1.3.1 Create dashboard layout with summary cards
  - Student info card (name, photo, class)
  - Overall progress card (avg score, trend)
  - Latest assessment card
  - **Time:** 2h

- [ ] 1.3.2 Implement 6-aspect radar chart
  - Library: recharts or victory-native
  - Show current achievement level per aspect (BB=1, MB=2, BSH=3, BSB=4)
  - Color coding: BB=red, MB=yellow, BSH=green, BSB=blue
  - **Time:** 4h

- [ ] 1.3.3 Create assessment timeline
  - Vertical timeline component
  - Group by date, show all aspects assessed
  - Click to view detail
  - **Time:** 3h

- [ ] 1.3.4 Implement aspect detail cards
  - One card per aspect (NAM, FM, KOG, BHS, SE, SNI)
  - Show: Current level, indicator progress, recent narratives
  - Expandable to show all indicators
  - **Time:** 3h

- [ ] 1.3.5 Add filter/period selector
  - Date range picker for historical view
  - Period selector (current week/month/semester)
  - **Time:** 1.5h

- [ ] 1.3.6 Integrate with API
  - Hook: `useQuery(['student-progress', studentId, period])`
  - Endpoint: `GET /api/paud-assessment/students/:id/summary`
  - Handle loading skeleton
  - **Time:** 1.5h

- [ ] 1.3.7 Write component tests
  - Test radar chart rendering
  - Test timeline interactions
  - **Time:** 0.5h

- [ ] 1.3.8 Run tests & verify
  - **Time:** 0.5h

**Dependencies:** 1.1, 1.2  
**Acceptance Criteria:**

- Radar chart displays correctly with accurate data
- Timeline is navigable and clickable
- Filters update data correctly

---

### 1.4 PAUD Class Dashboard

**Route:** `/paud/assessment/class/[id]`  
**References:** [Req 4.1.4] [BE 2.1, 3.1] [FE 2.4]  
**Estimated:** 14 hours

#### Tasks:

- [ ] 1.4.1 Create class overview cards
  - Total students card
  - Avg progress card (across all aspects)
  - Latest assessments card
  - **Time:** 2h

- [ ] 1.4.2 Implement student grid/list view
  - Toggle between grid and table view
  - Student card: photo, name, avg level, last assessed date
  - Click to view student progress
  - **Time:** 3h

- [ ] 1.4.3 Create achievement distribution chart
  - Stacked bar chart per aspect
  - X-axis: 6 aspects, Y-axis: student count
  - Segments: BB (red), MB (yellow), BSH (green), BSB (blue)
  - **Time:** 4h

- [ ] 1.4.4 Implement aspect comparison table
  - Rows: Aspects (NAM, FM, etc.)
  - Columns: BB count, MB count, BSH count, BSB count, Avg
  - Sortable by column
  - **Time:** 2.5h

- [ ] 1.4.5 Add export to CSV functionality
  - Button to export class summary
  - Includes student list with all aspect levels
  - **Time:** 1.5h

- [ ] 1.4.6 Integrate with API
  - Hook: `useQuery(['class-summary', classId])`
  - Endpoint: `GET /api/paud-assessment/classes/:id/summary`
  - **Time:** 0.5h

- [ ] 1.4.7 Write component tests
  - **Time:** 0.5h

**Dependencies:** 1.3  
**Acceptance Criteria:**

- Distribution chart accurately reflects class data
- Student grid is sortable and filterable
- Export generates correct CSV

---

### 1.5 PAUD Report Generation

**Route:** `/paud/assessment/report/generate`  
**References:** [Req 4.1.5] [BE 2.2] [FE 2.5]  
**Estimated:** 18 hours

#### Tasks:

- [ ] 1.5.1 Create report generation wizard (3 steps)
  - Step 1: Select students (multi-select)
  - Step 2: Select period & template
  - Step 3: Preview & generate
  - **Time:** 3h

- [ ] 1.5.2 Implement student multi-select
  - Checkbox table with search/filter
  - Select all, select by class
  - Show count of selected
  - **Time:** 2h

- [ ] 1.5.3 Implement report template selector
  - Template options: Standard, Detailed, Simple
  - Preview template layout
  - Customize options (include photos, narratives)
  - **Time:** 2h

- [ ] 1.5.4 Create report preview component
  - Display sample report for first student
  - Use actual PDF layout
  - **Time:** 3h

- [ ] 1.5.5 Integrate PDF generation
  - Library: react-pdf or jsPDF
  - Generate multi-page PDF for all selected students
  - Progress indicator during generation
  - **Time:** 4h

- [ ] 1.5.6 Implement download & print actions
  - Download ZIP if multiple students
  - Print preview modal
  - **Time:** 2h

- [ ] 1.5.7 Add batch processing for large selections
  - Process in chunks (10 students per batch)
  - Show progress bar
  - **Time:** 1h

- [ ] 1.5.8 Write tests
  - **Time:** 0.5h

- [ ] 1.5.9 Run tests & verify
  - **Time:** 0.5h

**Dependencies:** 1.3, 1.4  
**Acceptance Criteria:**

- Can generate report for single or multiple students
- PDF format matches school standards
- Progress bar updates accurately

---

### 1.6 PAUD Indicator Management

**Route:** `/paud/assessment/indicators`  
**References:** [Req 4.1.6] [BE 2.3] [FE 2.6]  
**Estimated:** 10 hours

#### Tasks:

- [ ] 1.6.1 Create indicators list page
  - Group by aspect (NAM, FM, etc.)
  - Expandable accordion per aspect
  - **Time:** 2h

- [ ] 1.6.2 Implement indicator CRUD forms
  - Create modal
  - Edit modal
  - Delete confirmation
  - **Time:** 3h

- [ ] 1.6.3 Add bulk import from Kurikulum Merdeka
  - CSV template download
  - CSV upload with validation
  - Preview before save
  - **Time:** 3h

- [ ] 1.6.4 Implement indicator reordering
  - Drag & drop to change order
  - Save new order to backend
  - **Time:** 1.5h

- [ ] 1.6.5 Write tests & verify
  - **Time:** 0.5h

**Dependencies:** None (admin tool)  
**Acceptance Criteria:**

- Indicators are manageable per aspect
- Bulk import works correctly
- Order is persisted

---

### 1.7 PAUD Settings & Configuration

**Route:** `/paud/settings`  
**References:** [Req 4.1.7] [FE 2.7]  
**Estimated:** 6 hours

#### Tasks:

- [ ] 1.7.1 Create settings page layout
  - Tab navigation: General, Templates, Notifications
  - **Time:** 1h

- [ ] 1.7.2 Implement General tab
  - Academic year selector
  - Default period type
  - Achievement thresholds
  - **Time:** 1.5h

- [ ] 1.7.3 Implement Templates tab
  - Report template upload
  - Template preview
  - **Time:** 2h

- [ ] 1.7.4 Implement Notifications tab
  - Toggle notifications on/off
  - Notification schedule
  - **Time:** 1h

- [ ] 1.7.5 Write tests & verify
  - **Time:** 0.5h

**Dependencies:** None  
**Acceptance Criteria:**

- Settings are saved and applied system-wide
- Template upload works

---

### 1.8 PAUD Mobile Responsive

**References:** [Req 4.4] [FE 1.2]  
**Estimated:** 12 hours

#### Tasks:

- [ ] 1.8.1 Audit all PAUD pages for mobile layout
  - Test on mobile viewport (375px, 768px)
  - Identify layout issues
  - **Time:** 2h

- [ ] 1.8.2 Fix assessment list page mobile layout
  - Responsive table (stack on mobile)
  - Mobile-friendly filters
  - **Time:** 2h

- [ ] 1.8.3 Fix assessment form mobile layout
  - Stepper adapts to mobile
  - Form fields adjust width
  - **Time:** 2h

- [ ] 1.8.4 Fix progress dashboard mobile layout
  - Cards stack vertically
  - Radar chart scales correctly
  - **Time:** 2h

- [ ] 1.8.5 Fix class dashboard mobile layout
  - Grid becomes list on mobile
  - Charts adjust size
  - **Time:** 2h

- [ ] 1.8.6 Test on real devices
  - iOS Safari, Android Chrome
  - **Time:** 1.5h

- [ ] 1.8.7 Write responsive tests
  - **Time:** 0.5h

**Dependencies:** 1.1-1.7  
**Acceptance Criteria:**

- All pages usable on mobile (touch-friendly)
- No horizontal scroll
- Charts/graphs display correctly

---

### 1.9 PAUD Integration Testing

**References:** [Test Plan 2.2]  
**Estimated:** 8 hours

#### Tasks:

- [ ] 1.9.1 Write E2E test: Create assessment flow
  - Playwright test from login → create → verify
  - **Time:** 2h

- [ ] 1.9.2 Write E2E test: View student progress
  - Navigate to student dashboard, verify data
  - **Time:** 1.5h

- [ ] 1.9.3 Write E2E test: Generate report
  - Select students → generate → download
  - **Time:** 2h

- [ ] 1.9.4 Write integration test: API + DB
  - Test full CRUD cycle with real DB
  - **Time:** 2h

- [ ] 1.9.5 Run all tests & fix failures
  - **Time:** 0.5h

**Dependencies:** 1.1-1.8  
**Acceptance Criteria:**

- All E2E tests pass
- Coverage ≥ 70% for PAUD pages

---

### 1.10 PAUD Documentation

**References:** [Req 8.1]  
**Estimated:** 4 hours

#### Tasks:

- [ ] 1.10.1 Write user guide for teachers
  - How to create assessments
  - How to view student progress
  - **Time:** 1.5h

- [ ] 1.10.2 Write admin guide for indicator management
  - **Time:** 1h

- [ ] 1.10.3 Create video tutorial (optional)
  - **Time:** 1h

- [ ] 1.10.4 Review & publish docs
  - **Time:** 0.5h

**Dependencies:** 1.9  
**Acceptance Criteria:**

- Docs are clear and complete
- Published in accessible location (docs site or PDF)

---

## 2. Tahfidz Enhancement Implementation

**Total:** 112 hours | **Priority:** P2 (High) | **Sprint:** 3-4

### 2.1 Murojaah Analytics Dashboard ✅

**Route:** `/tahfidz/murojaah/analytics`  
**References:** [Req 5.1] [BE 2.4, 3.4] [FE 2.8]  
**Estimated:** 18 hours  
**Actual:** 15 hours (Sessions 1-4)  
**Status:** ✅ Complete - Ready for E2E testing

#### Tasks:

- [x] 2.1.1 Create analytics dashboard layout
  - Summary cards: Total records, avg quality, consistency
  - **Time:** 2h ✅ (Session 1)

- [x] 2.1.2 Implement quality distribution chart
  - Pie chart: Excellent (>90), Good (75-90), Fair (60-75), Poor (<60)
  - **Time:** 3h ✅ (Session 1)

- [x] 2.1.3 Create mistake analysis chart
  - Bar chart: Mistake types (Lahin Jali, Lahin Khafi, Tajwid, Other)
  - Group by frequency
  - **Time:** 3h ✅ (Session 1)

- [x] 2.1.4 Implement consistency tracking graph
  - Line chart: Quality score over time
  - Show trend line
  - **Time:** 3h ✅ (Session 1)

- [x] 2.1.5 Create student ranking table
  - Sortable by: Avg quality, consistency, total records
  - Pagination
  - **Time:** 2.5h ✅ (Session 1)

- [x] 2.1.6 Add filters
  - Date range, halaqoh, murojaah type
  - **Time:** 1.5h ✅ (Session 1)

- [x] 2.1.7 Integrate with API
  - Backend: 4 analytics endpoints (Session 3)
  - React hooks: useMurojaahAnalytics (Session 3)
  - Dashboard integration: Complete (Session 3-4)
  - **Time:** 2.5h ✅ (Session 3-4)

- [ ] 2.1.8 Write tests & verify
  - **Time:** 1h

**Dependencies:** Backend API exists ✅  
**Acceptance Criteria:**

- ✅ Charts display accurate data
- ✅ Filters update charts correctly
- ✅ Ranking updates in real-time
- ⏳ E2E tests pending

**Notes:**

- Initial mock data implementation: Session 1 (12h)
- Backend API implementation: Session 3 (2.5h)
- JSX fixes & completion: Session 4 (0.5h)
- Total actual: 15h (3h under estimate)

---

### 2.2 Murojaah Input Form Enhancement

**Route:** `/tahfidz/murojaah/new`, `/tahfidz/murojaah/[id]/edit`  
**References:** [Req 5.1.2] [BE 2.4] [FE 2.9]  
**Estimated:** 10 hours

#### Tasks:

- [ ] 2.2.1 Enhance form layout with better UX
  - Auto-fill student from halaqoh
  - Juz/Surah/Ayat picker with search
  - **Time:** 3h

- [ ] 2.2.2 Implement mistake tracking UI
  - Dynamic form: Add mistake type + count
  - Suggestions for common mistakes
  - **Time:** 2.5h

- [ ] 2.2.3 Add quality score calculator
  - Auto-calculate based on mistake count
  - Manual override option
  - **Time:** 2h

- [ ] 2.2.4 Implement voice note recording (optional)
  - Record audio of recitation
  - Save with record
  - **Time:** 2h

- [ ] 2.2.5 Write tests & verify
  - **Time:** 0.5h

**Dependencies:** 2.1  
**Acceptance Criteria:**

- Form is intuitive and fast to use
- Quality score calculation is accurate
- Voice note (if implemented) works

---

### 2.3 Simaan Exam Management

**Route:** `/tahfidz/simaan`  
**References:** [Req 5.2] [BE 2.5, 3.5] [FE 2.10-2.12]  
**Estimated:** 24 hours

#### Tasks:

- [ ] 2.3.1 Create simaan exam list page
  - Table: Student, Type, Status, Date, Score
  - Filters: Type, status, date range
  - **Time:** 3h

- [ ] 2.3.2 Implement exam scheduling form
  - Select student(s)
  - Select type (Bi Nazhr, Bil Ghaib, Tahdir, Tasmi)
  - Assign examiners (multi-select)
  - Set date & time
  - **Time:** 4h

- [ ] 2.3.3 Create exam scoring page
  - Scoring form: Overall, Tajwid, Fashohah, Fluency, Makhrij
  - Each scored 0-100
  - Examiner notes textarea
  - **Time:** 3h

- [ ] 2.3.4 Implement multi-examiner support
  - Each examiner scores independently
  - Calculate average automatically
  - Display individual & avg scores
  - **Time:** 4h

- [ ] 2.3.5 Create marathon exam (30 juz) UI
  - Multi-session scheduling
  - Progress tracker (juz completed)
  - Session-by-session scoring
  - **Time:** 5h

- [ ] 2.3.6 Implement pass/fail determination
  - Auto-determine based on score threshold (75)
  - Override option for admin
  - **Time:** 2h

- [ ] 2.3.7 Create exam result view
  - Student view: Score breakdown, examiner feedback
  - Admin view: All exams, statistics
  - **Time:** 2h

- [ ] 2.3.8 Write tests & verify
  - **Time:** 1h

**Dependencies:** 2.1, 2.2  
**Acceptance Criteria:**

- Exams can be scheduled with multiple examiners
- Marathon exams support multi-session
- Pass/fail is accurate

---

### 2.4 Simaan Schedule & Notifications

**Route:** `/tahfidz/simaan/schedule`  
**References:** [Req 5.2.3] [BE 2.5] [FE 2.13]  
**Estimated:** 8 hours

#### Tasks:

- [ ] 2.4.1 Create schedule calendar view
  - Month/week view
  - Show scheduled exams on calendar
  - Click to view detail
  - **Time:** 3h

- [ ] 2.4.2 Implement schedule CRUD
  - Create, edit, cancel exam schedule
  - **Time:** 2h

- [ ] 2.4.3 Add notification system
  - Email/WhatsApp notification to student & examiners
  - Reminder 1 day before
  - **Time:** 2h

- [ ] 2.4.4 Write tests & verify
  - **Time:** 1h

**Dependencies:** 2.3  
**Acceptance Criteria:**

- Calendar displays all exams correctly
- Notifications are sent

---

### 2.5 Sanad Certificate Generation

**Route:** `/tahfidz/sanad`  
**References:** [Req 5.3] [BE 2.6, 3.6] [FE 2.14-2.16]  
**Estimated:** 20 hours

#### Tasks:

- [ ] 2.5.1 Create sanad record management page
  - List all sanad records
  - CRUD for chain of transmission
  - **Time:** 4h

- [ ] 2.5.2 Implement certificate generation form
  - Select student
  - Input sanad chain (lineage)
  - Select certificate type (Khatam, Ijazah, Sanad)
  - Issuer info (name, title, signature)
  - **Time:** 4h

- [ ] 2.5.3 Create certificate PDF template
  - Design professional certificate layout
  - Arabic calligraphy header
  - QR code for verification
  - **Time:** 6h

- [ ] 2.5.4 Implement PDF generation
  - Library: react-pdf or @react-pdf/renderer
  - Generate from template with data
  - Save to storage (S3 or local)
  - **Time:** 3h

- [ ] 2.5.5 Create certificate verification page
  - Public page: `/verify-certificate/:number`
  - Scan QR → display certificate details
  - **Time:** 2h

- [ ] 2.5.6 Write tests & verify
  - **Time:** 1h

**Dependencies:** 2.3 (requires passed marathon exam)  
**Acceptance Criteria:**

- Certificate PDF is high-quality and printable
- QR verification works
- PDF is downloadable

---

### 2.6 Tahfidz Student Profile Enhancement

**Route:** `/tahfidz/students/[id]`  
**References:** [Req 5.4] [FE 2.17]  
**Estimated:** 12 hours

#### Tasks:

- [ ] 2.6.1 Create comprehensive profile layout
  - Header: Photo, name, halaqoh, enrollment date
  - Tabs: Murojaah, Simaan, Certificates
  - **Time:** 2h

- [ ] 2.6.2 Implement Murojaah tab
  - Quality trend chart
  - Recent records table
  - Statistics cards
  - **Time:** 3h

- [ ] 2.6.3 Implement Simaan tab
  - Exam history table
  - Pass rate card
  - Latest exam detail
  - **Time:** 3h

- [ ] 2.6.4 Implement Certificates tab
  - List all certificates with preview
  - Download buttons
  - **Time:** 2h

- [ ] 2.6.5 Add goal tracking feature
  - Set target (e.g., "Khatam in 2 years")
  - Progress bar
  - **Time:** 1.5h

- [ ] 2.6.6 Write tests & verify
  - **Time:** 0.5h

**Dependencies:** 2.1, 2.3, 2.5  
**Acceptance Criteria:**

- Profile shows complete tahfidz journey
- Charts and stats are accurate

---

### 2.7 Tahfidz Mobile Responsive

**References:** [Req 4.4]  
**Estimated:** 10 hours

#### Tasks:

- [ ] 2.7.1 Audit all tahfidz pages for mobile
  - **Time:** 1.5h

- [ ] 2.7.2 Fix analytics dashboard mobile layout
  - **Time:** 2h

- [ ] 2.7.3 Fix simaan pages mobile layout
  - **Time:** 2h

- [ ] 2.7.4 Fix certificate generation mobile layout
  - **Time:** 2h

- [ ] 2.7.5 Fix student profile mobile layout
  - **Time:** 2h

- [ ] 2.7.6 Test on real devices & verify
  - **Time:** 0.5h

**Dependencies:** 2.1-2.6  
**Acceptance Criteria:**

- All pages usable on mobile

---

### 2.8 Tahfidz Integration Testing

**References:** [Test Plan 2.2]  
**Estimated:** 8 hours

#### Tasks:

- [ ] 2.8.1 Write E2E test: Murojaah record flow
  - **Time:** 2h

- [ ] 2.8.2 Write E2E test: Simaan exam flow
  - **Time:** 2h

- [ ] 2.8.3 Write E2E test: Certificate generation
  - **Time:** 2h

- [ ] 2.8.4 Write integration tests
  - **Time:** 1.5h

- [ ] 2.8.5 Run all tests & fix failures
  - **Time:** 0.5h

**Dependencies:** 2.1-2.7  
**Acceptance Criteria:**

- All E2E tests pass

---

### 2.9 Tahfidz Documentation

**References:** [Req 8.1]  
**Estimated:** 2 hours

#### Tasks:

- [ ] 2.9.1 Write muhafidz user guide
  - **Time:** 1h

- [ ] 2.9.2 Write admin guide for simaan & sanad
  - **Time:** 0.5h

- [ ] 2.9.3 Review & publish
  - **Time:** 0.5h

**Dependencies:** 2.8  
**Acceptance Criteria:**

- Docs published

---

## 3. Multi-Unit Dashboard Implementation

**Total:** 88 hours | **Priority:** P3 (Medium) | **Sprint:** 5

### 3.1 Executive Dashboard (Yayasan Admin)

**Route:** `/dashboard/executive`  
**References:** [Req 6.1] [BE 2.7, 3.7] [FE 2.18]  
**Estimated:** 20 hours

#### Tasks:

- [ ] 3.1.1 Create dashboard layout with KPI cards
  - Total students (all units)
  - Total teachers
  - Overall attendance rate
  - Tahfidz progress
  - **Time:** 3h

- [ ] 3.1.2 Implement real-time WebSocket integration
  - Hook: `useRealtimeDashboard()`
  - Subscribe to metrics updates
  - Update UI on events
  - **Time:** 4h

- [ ] 3.1.3 Create student enrollment trend chart
  - Line chart: Monthly student count per unit
  - Stacked area chart option
  - **Time:** 3h

- [ ] 3.1.4 Implement attendance overview chart
  - Bar chart: Attendance rate per unit
  - Color: Red (<75%), Yellow (75-85%), Green (>85%)
  - **Time:** 3h

- [ ] 3.1.5 Create tahfidz metrics section
  - Cards: Total hafidz, avg murojaah quality, simaan this month
  - Mini charts per metric
  - **Time:** 3h

- [ ] 3.1.6 Add alerts/notifications panel
  - List critical alerts (low attendance, low performance)
  - Dismiss & acknowledge actions
  - **Time:** 2.5h

- [ ] 3.1.7 Write tests & verify
  - **Time:** 1.5h

**Dependencies:** Backend WebSocket implemented  
**Acceptance Criteria:**

- Dashboard updates in real-time (< 1 min latency)
- KPIs are accurate
- Charts display correctly

---

### 3.2 Unit Comparison Dashboard

**Route:** `/dashboard/comparison`  
**References:** [Req 6.2] [BE 2.7] [FE 2.19]  
**Estimated:** 16 hours

#### Tasks:

- [ ] 3.2.1 Create comparison table
  - Rows: Units (PAUD, TKQ, SDIT, SMPIT, SMAQ, Pesantren)
  - Columns: Students, Teachers, Attendance, Tahfidz, Finance
  - Sortable by column
  - **Time:** 4h

- [ ] 3.2.2 Implement comparison chart
  - Grouped bar chart: Compare metrics across units
  - Toggle between metrics
  - **Time:** 4h

- [ ] 3.2.3 Create unit detail drawer
  - Click row → drawer opens
  - Show detailed metrics for selected unit
  - **Time:** 3h

- [ ] 3.2.4 Add export to Excel
  - Export comparison table
  - Include charts as images
  - **Time:** 2.5h

- [ ] 3.2.5 Integrate with API
  - **Time:** 1.5h

- [ ] 3.2.6 Write tests & verify
  - **Time:** 1h

**Dependencies:** 3.1  
**Acceptance Criteria:**

- Comparison is clear and informative
- Export works correctly

---

### 3.3 Performance Metrics Dashboard

**Route:** `/dashboard/performance`  
**References:** [Req 6.3] [FE 2.20]  
**Estimated:** 14 hours

#### Tasks:

- [ ] 3.3.1 Create metric selector
  - Dropdown: Select metric to display (attendance, academic, tahfidz)
  - **Time:** 1.5h

- [ ] 3.3.2 Implement performance trend chart
  - Line chart: Metric over time (monthly)
  - Multiple lines for each unit
  - **Time:** 4h

- [ ] 3.3.3 Create heatmap visualization
  - Rows: Units, Columns: Months
  - Color intensity: Metric value
  - **Time:** 4h

- [ ] 3.3.4 Add threshold lines & alerts
  - Draw threshold line on charts (e.g., 80% attendance target)
  - Highlight units below threshold
  - **Time:** 2.5h

- [ ] 3.3.5 Integrate with API
  - **Time:** 1.5h

- [ ] 3.3.6 Write tests & verify
  - **Time:** 0.5h

**Dependencies:** 3.2  
**Acceptance Criteria:**

- Heatmap is readable
- Threshold alerts are visible

---

### 3.4 Unit-Specific Dashboard

**Route:** `/dashboard/unit/[id]`  
**References:** [Req 6.4] [FE 2.21]  
**Estimated:** 12 hours

#### Tasks:

- [ ] 3.4.1 Create unit overview cards
  - Students (active, inactive), teachers, classes
  - **Time:** 2h

- [ ] 3.4.2 Implement unit-specific metrics
  - Attendance chart
  - Academic performance chart (if applicable)
  - Tahfidz progress (for units with tahfidz)
  - **Time:** 4h

- [ ] 3.4.3 Create teacher performance table
  - List teachers with class count, attendance rate
  - **Time:** 2h

- [ ] 3.4.4 Add student list with quick actions
  - Sortable table
  - Quick actions: View profile, attendance
  - **Time:** 2.5h

- [ ] 3.4.5 Integrate with API
  - **Time:** 1h

- [ ] 3.4.6 Write tests & verify
  - **Time:** 0.5h

**Dependencies:** 3.3  
**Acceptance Criteria:**

- Dashboard is comprehensive for unit admin
- Data is specific to selected unit

---

### 3.5 Real-time Notifications

**Route:** Various (toast/notifications)  
**References:** [Req 6.5] [BE 3.8]  
**Estimated:** 10 hours

#### Tasks:

- [ ] 3.5.1 Implement notification center component
  - Bell icon with badge (unread count)
  - Dropdown list of notifications
  - **Time:** 3h

- [ ] 3.5.2 Create notification types
  - Alert (critical)
  - Info
  - Success
  - **Time:** 1.5h

- [ ] 3.5.3 Integrate with WebSocket
  - Listen to `alert:new` event
  - Display toast + add to notification center
  - **Time:** 2.5h

- [ ] 3.5.4 Implement mark as read/dismiss
  - **Time:** 1.5h

- [ ] 3.5.5 Add notification preferences page
  - Toggle notifications on/off per type
  - **Time:** 1h

- [ ] 3.5.6 Write tests & verify
  - **Time:** 0.5h

**Dependencies:** 3.1  
**Acceptance Criteria:**

- Notifications appear in real-time
- User can dismiss/mark as read

---

### 3.6 Dashboard Mobile Responsive

**References:** [Req 4.4]  
**Estimated:** 8 hours

#### Tasks:

- [ ] 3.6.1 Audit all dashboard pages
  - **Time:** 1h

- [ ] 3.6.2 Fix executive dashboard mobile
  - **Time:** 2h

- [ ] 3.6.3 Fix comparison dashboard mobile
  - **Time:** 2h

- [ ] 3.6.4 Fix performance dashboard mobile
  - **Time:** 2h

- [ ] 3.6.5 Test & verify
  - **Time:** 1h

**Dependencies:** 3.1-3.5  
**Acceptance Criteria:**

- All dashboards usable on mobile

---

### 3.7 Dashboard Integration Testing

**References:** [Test Plan 2.2]  
**Estimated:** 6 hours

#### Tasks:

- [ ] 3.7.1 Write E2E test: Executive dashboard view
  - **Time:** 1.5h

- [ ] 3.7.2 Write E2E test: Real-time updates
  - **Time:** 2h

- [ ] 3.7.3 Write integration tests
  - **Time:** 2h

- [ ] 3.7.4 Run tests & fix
  - **Time:** 0.5h

**Dependencies:** 3.1-3.6  
**Acceptance Criteria:**

- E2E tests pass

---

### 3.8 Dashboard Documentation

**References:** [Req 8.1]  
**Estimated:** 2 hours

#### Tasks:

- [ ] 3.8.1 Write admin guide for dashboards
  - **Time:** 1h

- [ ] 3.8.2 Review & publish
  - **Time:** 1h

**Dependencies:** 3.7  
**Acceptance Criteria:**

- Docs published

---

## 4. Integration & Testing

**Total:** 80 hours | **Priority:** P5 (Enhancement) | **Sprint:** 6

### 4.1 Cross-Module Integration Tests

**References:** [Test Plan 5.1]  
**Estimated:** 16 hours

#### Tasks:

- [ ] 4.1.1 Test PAUD assessment → Daily report flow
  - Create assessment → verify daily report triggered
  - **Time:** 3h

- [ ] 4.1.2 Test Murojaah → Simaan readiness flow
  - Create 30 murojaah records → check readiness alert
  - **Time:** 3h

- [ ] 4.1.3 Test Simaan → Sanad certificate flow
  - Complete marathon exam → verify certificate generation
  - **Time:** 3h

- [ ] 4.1.4 Test Dashboard real-time updates
  - Create assessment → verify dashboard metric update
  - **Time:** 3h

- [ ] 4.1.5 Test multi-unit aggregation
  - Verify metrics aggregate correctly across units
  - **Time:** 3h

- [ ] 4.1.6 Run tests & fix failures
  - **Time:** 1h

**Dependencies:** All modules complete  
**Acceptance Criteria:**

- All integration workflows pass
- No data inconsistencies

---

### 4.2 Performance Optimization

**References:** [BE 4.1-4.3]  
**Estimated:** 20 hours

#### Tasks:

- [x] 4.2.1 Implement Redis caching ✅ COMPLETE
  - [x] Cache dashboard metrics (TTL: 60s) - Read-through cache with invalidation
  - [x] Cache utility functions (warmDashboardCache, invalidateDashboardCache)
  - [x] Comprehensive error handling and logging
  - [ ] Cache student lists (TTL: 5 min)
  - [ ] Cache report data (TTL: 30 min)
  - **Time:** 6h (2h spent on dashboard metrics, 4h remaining for other caches)
  - **Docs:** `/apps/api/docs/DASHBOARD_CACHING.md`

- [ ] 4.2.2 Optimize database queries
  - Add missing indexes
  - Optimize N+1 queries (use `include` properly)
  - **Time:** 4h

- [ ] 4.2.3 Implement pagination for large lists
  - Student lists, assessment lists
  - **Time:** 3h

- [ ] 4.2.4 Lazy load components
  - Code split large components
  - Lazy load charts
  - **Time:** 3h

- [ ] 4.2.5 Optimize images & assets
  - Compress images
  - Use Next.js Image component
  - **Time:** 2h

- [ ] 4.2.6 Run performance tests (k6)
  - Test dashboard endpoints under load
  - **Time:** 1.5h

- [ ] 4.2.7 Fix performance issues found
  - **Time:** 0.5h

**Dependencies:** 4.1  
**Acceptance Criteria:**

- Dashboard loads < 500ms (p95)
- API response < 200ms (p95)
- No API errors under load (< 1%)

---

### 4.3 Security Enhancements

**References:** [BE 4.4, 4.5]  
**Estimated:** 12 hours

#### Tasks:

- [ ] 4.3.1 Audit all API endpoints for authorization
  - Ensure RBAC checks in place
  - Test unauthorized access attempts
  - **Time:** 4h

- [ ] 4.3.2 Implement rate limiting
  - Apply to sensitive endpoints (login, report generation)
  - **Time:** 2h

- [ ] 4.3.3 Add CSRF protection
  - Implement CSRF tokens
  - **Time:** 2h

- [ ] 4.3.4 Sanitize user inputs
  - XSS prevention
  - SQL injection prevention (Prisma handles this)
  - **Time:** 2h

- [ ] 4.3.5 Security testing
  - Run OWASP ZAP scan
  - Fix vulnerabilities
  - **Time:** 2h

**Dependencies:** All modules  
**Acceptance Criteria:**

- No unauthorized access possible
- Rate limiting works
- No XSS/CSRF vulnerabilities

---

### 4.4 Accessibility (a11y) Improvements

**References:** [Req 4.4]  
**Estimated:** 10 hours

#### Tasks:

- [ ] 4.4.1 Audit all pages for accessibility
  - Run axe or Lighthouse accessibility scan
  - **Time:** 2h

- [ ] 4.4.2 Add ARIA labels to interactive elements
  - Buttons, links, form fields
  - **Time:** 3h

- [ ] 4.4.3 Ensure keyboard navigation works
  - Tab through all pages
  - Fix focus issues
  - **Time:** 2.5h

- [ ] 4.4.4 Add screen reader support
  - Test with NVDA or VoiceOver
  - **Time:** 2h

- [ ] 4.4.5 Fix color contrast issues
  - Ensure WCAG AA compliance
  - **Time:** 0.5h

**Dependencies:** All modules  
**Acceptance Criteria:**

- Lighthouse accessibility score ≥ 90
- Keyboard navigation works everywhere

---

### 4.5 Error Handling & Logging

**References:** [BE 5]  
**Estimated:** 8 hours

#### Tasks:

- [ ] 4.5.1 Implement Sentry error tracking
  - Configure Sentry for backend & frontend
  - **Time:** 2h

- [ ] 4.5.2 Improve error messages for users
  - User-friendly error messages
  - **Time:** 2h

- [ ] 4.5.3 Add structured logging
  - Log important events (login, report generation)
  - **Time:** 2h

- [ ] 4.5.4 Create error monitoring dashboard
  - View errors in Sentry
  - **Time:** 1.5h

- [ ] 4.5.5 Test error scenarios
  - Trigger errors intentionally, verify logging
  - **Time:** 0.5h

**Dependencies:** None  
**Acceptance Criteria:**

- Errors are tracked in Sentry
- Logs are structured and searchable

---

### 4.6 Load & Stress Testing

**References:** [Test Plan 3]  
**Estimated:** 8 hours

#### Tasks:

- [ ] 4.6.1 Setup k6 load testing
  - Install k6, create test scripts
  - **Time:** 1h

- [ ] 4.6.2 Test dashboard endpoints
  - 50 concurrent users
  - **Time:** 2h

- [ ] 4.6.3 Test assessment creation endpoint
  - 20 concurrent users
  - **Time:** 1.5h

- [ ] 4.6.4 Test report generation endpoint
  - 10 concurrent users (heavy operation)
  - **Time:** 1.5h

- [ ] 4.6.5 Analyze results & optimize
  - Identify bottlenecks
  - **Time:** 2h

**Dependencies:** 4.2  
**Acceptance Criteria:**

- System handles expected load without errors

---

### 4.7 Monitoring & Observability

**References:** [Test Plan 4]  
**Estimated:** 6 hours

#### Tasks:

- [ ] 4.7.1 Setup Prometheus metrics
  - Expose /metrics endpoint
  - **Time:** 2h

- [ ] 4.7.2 Create Grafana dashboards
  - Dashboard for API metrics
  - Dashboard for business metrics
  - **Time:** 3h

- [ ] 4.7.3 Setup alerts
  - Alert on high error rate, low performance
  - **Time:** 1h

**Dependencies:** 4.5  
**Acceptance Criteria:**

- Metrics are collected
- Dashboards display correctly

---

## 5. Documentation & Deployment

**Total:** 24 hours | **Priority:** P5 (Enhancement) | **Sprint:** 6

### 5.1 User Documentation

**References:** [Req 8.1]  
**Estimated:** 8 hours

#### Tasks:

- [ ] 5.1.1 Write complete user manual
  - Sections for each role (admin, teacher, parent)
  - **Time:** 4h

- [ ] 5.1.2 Create quick start guide
  - 1-page guide for common tasks
  - **Time:** 1.5h

- [ ] 5.1.3 Record video tutorials
  - Screen recordings with voiceover
  - **Time:** 2h

- [ ] 5.1.4 Publish documentation
  - Deploy to docs site or PDF
  - **Time:** 0.5h

**Dependencies:** All modules  
**Acceptance Criteria:**

- Docs are comprehensive and clear
- Videos are helpful

---

### 5.2 Developer Documentation

**References:** [Req 8.2]  
**Estimated:** 6 hours

#### Tasks:

- [ ] 5.2.1 Update API documentation (Swagger)
  - Ensure all endpoints documented
  - **Time:** 2h

- [ ] 5.2.2 Write architecture documentation
  - System overview, component diagram
  - **Time:** 2h

- [ ] 5.2.3 Create deployment guide
  - Docker setup, environment variables
  - **Time:** 1.5h

- [ ] 5.2.4 Write contribution guide
  - For future developers
  - **Time:** 0.5h

**Dependencies:** All modules  
**Acceptance Criteria:**

- Devs can understand system architecture
- Deployment guide is complete

---

### 5.3 CI/CD Setup

**References:** [Test Plan 3]  
**Estimated:** 6 hours

#### Tasks:

- [ ] 5.3.1 Create GitHub Actions workflow
  - Run tests on push
  - **Time:** 2h

- [ ] 5.3.2 Setup Docker build pipeline
  - Build & push images to registry
  - **Time:** 2h

- [ ] 5.3.3 Configure deployment to production
  - Auto-deploy on merge to main
  - **Time:** 1.5h

- [ ] 5.3.4 Test CI/CD pipeline
  - Make test commit, verify deployment
  - **Time:** 0.5h

**Dependencies:** None  
**Acceptance Criteria:**

- CI/CD pipeline works
- Deployment is automated

---

### 5.4 Production Deployment

**References:** [Req 8.3]  
**Estimated:** 4 hours

#### Tasks:

- [ ] 5.4.1 Prepare production environment
  - Setup server, database, Redis
  - **Time:** 1h

- [ ] 5.4.2 Run database migrations
  - Apply all migrations to production
  - **Time:** 0.5h

- [ ] 5.4.3 Deploy application
  - Deploy backend & frontend
  - **Time:** 1h

- [ ] 5.4.4 Post-deployment verification
  - Test critical flows on production
  - **Time:** 1h

- [ ] 5.4.5 Monitor for issues
  - Watch logs & metrics for 24 hours
  - **Time:** 0.5h

**Dependencies:** 5.3, All modules tested  
**Acceptance Criteria:**

- Application is live
- No critical issues in first 24 hours

---

## Task Summary by Priority

| Priority             | Tasks                             | Estimated Hours   | Sprints       |
| -------------------- | --------------------------------- | ----------------- | ------------- |
| **P1 - Critical**    | PAUD Module                       | 116h              | 1-2           |
| **P2 - High**        | Tahfidz Enhancement               | 112h              | 3-4           |
| **P3 - Medium**      | Multi-Unit Dashboard              | 88h               | 5             |
| **P4 - Low**         | Daily Report (minor enhancements) | 0h (already done) | -             |
| **P5 - Enhancement** | Integration & Testing             | 80h               | 6             |
| **P5 - Enhancement** | Documentation & Deployment        | 24h               | 6             |
| **TOTAL**            |                                   | **420h**          | **6 sprints** |

---

## Dependency Graph

```
Setup (1.1)
   ↓
Database (2.1-2.3)
   ↓
┌──────────────┬──────────────┬──────────────┐
│              │              │              │
PAUD Module    Tahfidz        Dashboard
(1.1-1.10)     (2.1-2.9)      (3.1-3.8)
116h           112h           88h
Sprint 1-2     Sprint 3-4     Sprint 5
   │              │              │
   └──────────────┴──────────────┘
                  ↓
         Integration & Testing
              (4.1-4.7)
                80h
              Sprint 6
                  ↓
        Documentation & Deployment
              (5.1-5.4)
                24h
              Sprint 6
```

---

## Risk Mitigation

| Risk                                            | Impact | Mitigation                                        |
| ----------------------------------------------- | ------ | ------------------------------------------------- |
| Backend API changes needed during frontend dev  | Medium | Thoroughly review API specs before starting       |
| Chart libraries don't support required features | Medium | Prototype charts early (week 1)                   |
| PDF generation is complex                       | High   | Start PDF work early, have fallback (HTML print)  |
| WebSocket implementation issues                 | Medium | Test WebSocket early, have polling fallback       |
| Mobile responsive issues                        | Low    | Test mobile throughout development, not at end    |
| Performance problems under load                 | Medium | Run load tests early (week 4), optimize as needed |
| Integration test failures                       | High   | Write integration tests incrementally, not at end |

---

## Team Allocation Recommendations

For optimal velocity, consider this team structure:

| Role                 | Count       | Focus                          |
| -------------------- | ----------- | ------------------------------ |
| Frontend Developer   | 2           | 1 on PAUD, 1 on Tahfidz        |
| Full-stack Developer | 1           | Dashboard + integrations       |
| QA Engineer          | 1           | Testing all modules            |
| DevOps Engineer      | 0.5         | CI/CD + deployment (part-time) |
| **Total**            | **4.5 FTE** |                                |

**Timeline with this team:**

- Sprint 1-2 (4 weeks): Frontend devs on PAUD + Tahfidz in parallel
- Sprint 3-4 (4 weeks): Continue + Dashboard starts
- Sprint 5 (2 weeks): Wrap up Dashboard
- Sprint 6 (2 weeks): Integration, testing, deployment

**TOTAL: 12 weeks (3 months)**

---

## Next Steps

1. **Review & Approve** this implementation plan
2. **Setup Project Board** (GitHub Projects or Jira)
   - Create issues for each task
   - Assign to sprints
3. **Kick-off Sprint 1**
   - Start with PAUD Assessment List (1.1)
   - Prototype radar chart (1.3.2) early for validation
4. **Daily Standups**
   - Track progress
   - Unblock issues
5. **Weekly Sprint Reviews**
   - Demo completed features
   - Adjust plan if needed

---

**READY TO START IMPLEMENTATION! 🚀**
