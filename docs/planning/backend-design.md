# Backend Design Document - Cipansor Enhancement

**Versi:** 1.0.0
**Tanggal:** 5 Desember 2025
**Status:** Draft
**Referensi Dokumen:** requirements.md, database-design.md

---

## Daftar Isi

1. [Architecture Overview](#1-architecture-overview)
2. [PAUD Module API](#2-paud-module-api)
3. [Daily Report API](#3-daily-report-api)
4. [Tahfidz Enhancement API](#4-tahfidz-enhancement-api)
5. [Dashboard & Analytics API](#5-dashboard--analytics-api)
6. [Business Logic & Services](#6-business-logic--services)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Error Handling](#8-error-handling)
9. [Integration Services](#9-integration-services)

---

## 1. Architecture Overview

**Refs:** [Req 1.4] [DB 1.1]

### 1.1 Architecture Pattern

- **Pattern:** Layered Architecture (Controller → Service → Repository)
- **Framework:** Express 5 with TypeScript
- **ORM:** Prisma 5.x
- **Validation:** Zod schemas
- **Documentation:** Swagger/OpenAPI 3.0

### 1.2 Tech Stack

| Layer      | Technology | Version |
| ---------- | ---------- | ------- |
| Runtime    | Node.js    | 20.x    |
| Framework  | Express    | 5.x     |
| Language   | TypeScript | 5.x     |
| ORM        | Prisma     | 5.x     |
| Validation | Zod        | 3.x     |
| Auth       | JWT        | -       |
| Docs       | Swagger UI | -       |

### 1.3 Module Structure Pattern

```
modules/
└── [module-name]/
    ├── [module].routes.ts      # Route definitions + Swagger docs
    ├── [module].controller.ts  # Request handlers
    ├── [module].service.ts     # Business logic
    ├── [module].schema.ts      # Zod validation schemas
    └── index.ts                # Module exports
```

### 1.4 API Response Format

```typescript
// Success Response
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}

// Error Response
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "details": { ... }
  }
}
```

---

## 2. PAUD Module API

**Refs:** [Req 4.1], [Req 4.2], [Req 4.4] [DB 3.1, 3.2, 3.3, 3.4, 3.5]

### 2.1 Module: paud-assessment

#### 2.1.1 Endpoints

| Method | Endpoint                                         | Description                 | Auth       |
| ------ | ------------------------------------------------ | --------------------------- | ---------- |
| GET    | /api/paud/indicators                             | List development indicators | PAUD_GURU+ |
| GET    | /api/paud/indicators/:id                         | Get indicator detail        | PAUD_GURU+ |
| POST   | /api/paud/indicators                             | Create indicator (admin)    | PAUD_ADMIN |
| PUT    | /api/paud/indicators/:id                         | Update indicator            | PAUD_ADMIN |
| DELETE | /api/paud/indicators/:id                         | Delete indicator            | PAUD_ADMIN |
| GET    | /api/paud/assessments                            | List assessments            | PAUD_GURU+ |
| GET    | /api/paud/assessments/:id                        | Get assessment detail       | PAUD_GURU+ |
| POST   | /api/paud/assessments                            | Create assessment           | PAUD_GURU  |
| PUT    | /api/paud/assessments/:id                        | Update assessment           | PAUD_GURU  |
| DELETE | /api/paud/assessments/:id                        | Delete assessment           | PAUD_GURU  |
| POST   | /api/paud/assessments/:id/evidence               | Upload evidence             | PAUD_GURU  |
| DELETE | /api/paud/assessments/evidence/:id               | Delete evidence             | PAUD_GURU  |
| GET    | /api/paud/assessments/student/:studentId         | Get student assessments     | PAUD_GURU+ |
| GET    | /api/paud/assessments/student/:studentId/summary | Get student progress        | PAUD_GURU+ |
| POST   | /api/paud/assessments/bulk                       | Bulk create (class)         | PAUD_GURU  |

#### 2.1.2 Request/Response Schemas

**Create Assessment:**

```typescript
// POST /api/paud/assessments
// Request
{
  "studentId": "uuid",
  "academicYearId": "uuid",
  "semesterId": "uuid | null",
  "periodType": "HARIAN | MINGGUAN | BULANAN | SEMESTER",
  "periodDate": "2025-12-05",
  "aspect": "NAM | FM | KOG | BHS | SE | SNI",
  "indicatorId": "uuid | null",
  "achievementLevel": "BB | MB | BSH | BSB",
  "narrativeText": "string | null",
  "teacherNotes": "string | null",
  "recommendations": "string | null"
}

// Response
{
  "success": true,
  "data": {
    "id": "uuid",
    "studentId": "uuid",
    "student": { "id": "uuid", "name": "..." },
    "academicYearId": "uuid",
    "aspect": "NAM",
    "achievementLevel": "BSH",
    "narrativeText": "...",
    "evidences": [],
    "createdAt": "2025-12-05T10:00:00Z"
  }
}
```

**Student Progress Summary:**

```typescript
// GET /api/paud/assessments/student/:studentId/summary
// Query: academicYearId, semesterId (optional)
// Response
{
  "success": true,
  "data": {
    "studentId": "uuid",
    "studentName": "...",
    "academicYear": "2024/2025",
    "semester": "Ganjil",
    "summary": {
      "NAM": { "latestLevel": "BSH", "trend": "improving", "assessmentCount": 5 },
      "FM": { "latestLevel": "BSB", "trend": "stable", "assessmentCount": 5 },
      "KOG": { "latestLevel": "MB", "trend": "improving", "assessmentCount": 5 },
      "BHS": { "latestLevel": "BSH", "trend": "stable", "assessmentCount": 5 },
      "SE": { "latestLevel": "BSH", "trend": "stable", "assessmentCount": 5 },
      "SNI": { "latestLevel": "BSB", "trend": "improving", "assessmentCount": 5 }
    },
    "chartData": [
      { "date": "2025-10-01", "NAM": 2, "FM": 3, ... },
      { "date": "2025-11-01", "NAM": 3, "FM": 3, ... }
    ]
  }
}
```

#### 2.1.3 Validation Rules

**Refs:** [Req 4.1.1]

| Field            | Validation                          |
| ---------------- | ----------------------------------- |
| aspect           | Required, enum PAUDAspect           |
| achievementLevel | Required, enum PAUDAchievementLevel |
| periodDate       | Required, valid date, not future    |
| narrativeText    | Max 2000 chars                      |
| studentId        | Must exist, must be PAUD/TK student |

### 2.2 Module: paud-reports

#### 2.2.1 Endpoints

| Method | Endpoint                       | Description                    | Auth        |
| ------ | ------------------------------ | ------------------------------ | ----------- |
| GET    | /api/paud/reports              | List narrative reports         | PAUD_GURU+  |
| GET    | /api/paud/reports/:id          | Get report detail              | PAUD_GURU+  |
| POST   | /api/paud/reports              | Create/Init report             | PAUD_GURU   |
| PUT    | /api/paud/reports/:id          | Update report                  | PAUD_GURU   |
| POST   | /api/paud/reports/:id/finalize | Finalize report                | PAUD_KEPALA |
| POST   | /api/paud/reports/:id/photos   | Add photos                     | PAUD_GURU   |
| DELETE | /api/paud/reports/photos/:id   | Remove photo                   | PAUD_GURU   |
| GET    | /api/paud/reports/:id/pdf      | Generate PDF                   | PAUD_GURU+  |
| POST   | /api/paud/reports/generate     | Auto-generate from assessments | PAUD_GURU   |

#### 2.2.2 Request/Response Schemas

**Generate Report from Assessments:**

```typescript
// POST /api/paud/reports/generate
// Request
{
  "studentId": "uuid",
  "academicYearId": "uuid",
  "semesterId": "uuid"
}

// Response
{
  "success": true,
  "data": {
    "id": "uuid",
    "studentId": "uuid",
    "status": "DRAFT",
    "narrativeNAM": "Auto-generated narrative...",
    "narrativeFM": "...",
    // ... other narratives
    "overallStrengths": "Generated from assessments...",
    "areasForDevelopment": "..."
  }
}
```

#### 2.2.3 Business Rules

**Refs:** [Req 4.2.1], [Req 4.2.2]

1. Report dapat di-finalize hanya oleh Kepala Sekolah
2. Report yang sudah FINALIZED tidak bisa di-edit
3. Auto-generate menggunakan assessment data semester tersebut
4. Minimal 3 assessment per aspek untuk generate narrative
5. PDF export menggunakan template resmi PAUD

---

## 3. Daily Report API

**Refs:** [Req 4.3], [Req 5.3] [DB 4.1, 4.2, 4.3]

### 3.1 Module: daily-report

#### 3.1.1 Endpoints

| Method | Endpoint                                | Description           | Auth         |
| ------ | --------------------------------------- | --------------------- | ------------ |
| GET    | /api/daily-reports                      | List daily reports    | GURU+        |
| GET    | /api/daily-reports/:id                  | Get report detail     | GURU+        |
| POST   | /api/daily-reports                      | Create daily report   | GURU         |
| PUT    | /api/daily-reports/:id                  | Update report         | GURU         |
| DELETE | /api/daily-reports/:id                  | Delete report         | GURU         |
| POST   | /api/daily-reports/:id/photos           | Add photos            | GURU         |
| DELETE | /api/daily-reports/photos/:id           | Remove photo          | GURU         |
| POST   | /api/daily-reports/:id/homework         | Add homework          | GURU         |
| DELETE | /api/daily-reports/homework/:id         | Remove homework       | GURU         |
| POST   | /api/daily-reports/:id/notify           | Send to parent        | GURU         |
| GET    | /api/daily-reports/student/:studentId   | Get student reports   | GURU+/PARENT |
| GET    | /api/daily-reports/class/:classId/today | Today's class reports | GURU         |
| POST   | /api/daily-reports/bulk-checkin         | Bulk morning check-in | GURU         |

#### 3.1.2 Request/Response Schemas

**Create Daily Report:**

```typescript
// POST /api/daily-reports
// Request
{
  "studentId": "uuid",
  "reportDate": "2025-12-05",
  "unitType": "PAUD | TK | SD_IT",

  // Check-in
  "arrivalTime": "07:30:00",
  "mood": "HAPPY | NEUTRAL | SAD | TIRED | EXCITED | SICK",
  "healthStatus": "Sehat",
  "temperature": 36.5,
  "hadBreakfast": true,

  // Activities (PAUD)
  "mealStatus": "HABIS | SETENGAH | SEDIKIT | TIDAK_MAU",
  "snackStatus": "HABIS",
  "napDuration": 60,
  "toiletNotes": "BAB 1x, BAK 3x",

  // Activities (SD IT)
  "sholatDhuha": true,
  "tahfidzActivity": "Al-Fatihah ayat 1-7",

  // General
  "activitiesSummary": "Belajar mewarnai...",
  "achievements": "Sudah bisa menyebutkan warna",
  "behaviorNotes": "Bermain dengan baik",
  "teacherNotes": "Anak aktif hari ini",
  "homeActivity": "Mewarnai gambar hewan"
}

// Response
{
  "success": true,
  "data": {
    "id": "uuid",
    "studentId": "uuid",
    "student": { "id": "uuid", "name": "Ahmad" },
    "reportDate": "2025-12-05",
    "mood": "HAPPY",
    "notifiedAt": null,
    "photos": [],
    "homework": []
  }
}
```

**Bulk Check-in:**

```typescript
// POST /api/daily-reports/bulk-checkin
// Request
{
  "classId": "uuid",
  "reportDate": "2025-12-05",
  "students": [
    { "studentId": "uuid1", "arrivalTime": "07:30", "mood": "HAPPY", "hadBreakfast": true },
    { "studentId": "uuid2", "arrivalTime": "07:35", "mood": "NEUTRAL", "hadBreakfast": false },
    // ... more students
  ]
}

// Response
{
  "success": true,
  "data": {
    "created": 25,
    "failed": 0,
    "reports": [ ... ]
  }
}
```

#### 3.1.3 Notification Integration

**Refs:** [Req 4.3.3], [Req 10.1.4]

```typescript
// POST /api/daily-reports/:id/notify
// Request
{
  "via": "whatsapp | push | email | all"
}

// Response
{
  "success": true,
  "data": {
    "notifiedAt": "2025-12-05T15:00:00Z",
    "notifiedVia": "whatsapp",
    "deliveryStatus": "sent"
  }
}
```

#### 3.1.4 Business Rules

1. Satu report per student per hari (unique constraint)
2. Report hanya bisa dibuat untuk siswa di kelas yang diampu guru
3. Notification dikirim ke semua orang tua terdaftar
4. Parent dapat melihat report anaknya sendiri saja
5. Photos maksimal 5 per report, max 5MB per file

---

## 4. Tahfidz Enhancement API

**Refs:** [Req 7.1], [Req 7.2] [DB 5.1, 5.2, 5.3, 5.4, 5.5]

### 4.1 Module: murojaah

#### 4.1.1 Endpoints

| Method | Endpoint                                 | Description              | Auth      |
| ------ | ---------------------------------------- | ------------------------ | --------- |
| GET    | /api/murojaah                            | List murojaah records    | MUHAFIDZ+ |
| GET    | /api/murojaah/:id                        | Get murojaah detail      | MUHAFIDZ+ |
| POST   | /api/murojaah                            | Create murojaah record   | MUHAFIDZ  |
| PUT    | /api/murojaah/:id                        | Update murojaah          | MUHAFIDZ  |
| DELETE | /api/murojaah/:id                        | Delete murojaah          | MUHAFIDZ  |
| POST   | /api/murojaah/:id/mistakes               | Add mistake detail       | MUHAFIDZ  |
| DELETE | /api/murojaah/mistakes/:id               | Remove mistake           | MUHAFIDZ  |
| GET    | /api/murojaah/student/:studentId         | Student murojaah history | MUHAFIDZ+ |
| GET    | /api/murojaah/student/:studentId/summary | Student murojaah summary | MUHAFIDZ+ |
| GET    | /api/murojaah/halaqoh/:halaqohId         | Halaqoh murojaah records | MUHAFIDZ+ |
| GET    | /api/murojaah/schedule                   | Get murojaah schedule    | SANTRI+   |

#### 4.1.2 Request/Response Schemas

**Create Murojaah Record:**

```typescript
// POST /api/murojaah
// Request
{
  "studentId": "uuid",
  "enrollmentId": "uuid | null",
  "halaqohId": "uuid | null",
  "murojaahType": "YAUMIYAH | USBUIYAH | SYAHRIYAH | TASMI",
  "murojaahDate": "2025-12-05",
  "juzStart": 1,
  "juzEnd": 3,
  "pagesReviewed": 60,
  "durationMinutes": 45,
  "qualityScore": 85,
  "mistakeCount": 3,
  "fluencyLevel": 4,
  "tajwidScore": 80,
  "notes": "...",
  "improvementAreas": "Perlu perbaikan mad..."
}

// Response
{
  "success": true,
  "data": {
    "id": "uuid",
    "student": { "id": "uuid", "name": "Ahmad" },
    "murojaahType": "YAUMIYAH",
    "juzStart": 1,
    "juzEnd": 3,
    "qualityScore": 85,
    "mistakes": []
  }
}
```

**Student Murojaah Summary:**

```typescript
// GET /api/murojaah/student/:studentId/summary
// Query: startDate, endDate, murojaahType
// Response
{
  "success": true,
  "data": {
    "studentId": "uuid",
    "studentName": "Ahmad",
    "period": { "start": "2025-11-01", "end": "2025-11-30" },
    "summary": {
      "totalSessions": 25,
      "totalPages": 500,
      "totalMinutes": 750,
      "averageQuality": 82.5,
      "averageFluency": 4.2,
      "totalMistakes": 45,
      "byType": {
        "YAUMIYAH": { "sessions": 20, "pages": 400 },
        "USBUIYAH": { "sessions": 4, "pages": 80 },
        "SYAHRIYAH": { "sessions": 1, "pages": 20 }
      },
      "mistakeBreakdown": {
        "LAHIN_JALI": 10,
        "LAHIN_KHAFI": 15,
        "TAJWID": 12,
        "LUPA": 5,
        "URUTAN": 3
      }
    },
    "trend": [
      { "week": "W1", "avgQuality": 80, "sessions": 5 },
      { "week": "W2", "avgQuality": 82, "sessions": 6 },
      // ...
    ]
  }
}
```

### 4.2 Module: simaan

#### 4.2.1 Endpoints

| Method | Endpoint                              | Description                | Auth      |
| ------ | ------------------------------------- | -------------------------- | --------- |
| GET    | /api/simaan                           | List simaan exams          | MUHAFIDZ+ |
| GET    | /api/simaan/:id                       | Get simaan detail          | MUHAFIDZ+ |
| POST   | /api/simaan                           | Create simaan exam         | MUHAFIDZ  |
| PUT    | /api/simaan/:id                       | Update simaan              | MUHAFIDZ  |
| DELETE | /api/simaan/:id                       | Delete simaan              | MUHAFIDZ  |
| POST   | /api/simaan/:id/examiners             | Add examiner               | MUHAFIDZ  |
| PUT    | /api/simaan/:id/examiners/:examinerId | Update examiner score      | MUHAFIDZ  |
| DELETE | /api/simaan/examiners/:id             | Remove examiner            | MUHAFIDZ  |
| POST   | /api/simaan/:id/finalize              | Finalize & calculate grade | MUHAFIDZ  |
| GET    | /api/simaan/student/:studentId        | Student exam history       | MUHAFIDZ+ |
| POST   | /api/simaan/khatam                    | Create khatam exam         | MUHAFIDZ  |

#### 4.2.2 Request/Response Schemas

**Create Simaan Exam:**

```typescript
// POST /api/simaan
// Request
{
  "studentId": "uuid",
  "enrollmentId": "uuid | null",
  "simaanType": "BIN_NAZHR | BIL_GHAIB | TAHDIR | TASMI | KHATAM",
  "examDate": "2025-12-05T09:00:00Z",
  "sessionNumber": 1,
  "totalSessions": 1,
  "juzStart": 1,
  "juzEnd": 5,
  "notes": "..."
}

// Response
{
  "success": true,
  "data": {
    "id": "uuid",
    "student": { ... },
    "simaanType": "BIL_GHAIB",
    "status": "IN_PROGRESS",
    "examiners": []
  }
}
```

**Finalize Simaan:**

```typescript
// POST /api/simaan/:id/finalize
// Request
{
  "tajwidScore": 85,
  "fashohaScore": 90,
  "tartilScore": 88,
  "recommendations": "..."
}

// Response
{
  "success": true,
  "data": {
    "id": "uuid",
    "overallScore": 87.67,
    "grade": "Jayyid Jiddan",
    "passed": true,
    "finalizedAt": "2025-12-05T12:00:00Z"
  }
}
```

### 4.3 Module: sanad (Enhancement)

#### 4.3.1 Additional Endpoints

| Method | Endpoint                       | Description              | Auth      |
| ------ | ------------------------------ | ------------------------ | --------- |
| POST   | /api/sanad/:id/certificate     | Generate certificate     | MUHAFIDZ  |
| GET    | /api/sanad/:id/certificate/pdf | Download certificate PDF | MUHAFIDZ+ |
| GET    | /api/sanad/verify/:code        | Public verification      | PUBLIC    |

#### 4.3.2 Certificate Generation

**Refs:** [Req 7.2.3]

```typescript
// POST /api/sanad/:id/certificate
// Request
{
  "riwayat": "HAFS",
  "teacherSanadNumber": "1234",
  "chainDocumentUrl": "https://...",
  "ijazahType": "TAHFIDZ | SANAD | QIRAAT"
}

// Response
{
  "success": true,
  "data": {
    "id": "uuid",
    "certificateNumber": "CIPANSOR/SANAD/2025/001",
    "verificationCode": "ABC123XYZ",
    "publicVerificationUrl": "https://cipansor.or.id/verify/ABC123XYZ",
    "certificateUrl": "https://...",
    "issuedAt": "2025-12-05T12:00:00Z"
  }
}
```

#### 4.3.3 Grading Logic

**Refs:** [Req 7.1.3]

```typescript
// Grade calculation based on scores
function calculateGrade(scores: {
  tajwid: number;
  fashoha: number;
  tartil: number;
}): { overall: number; grade: string; passed: boolean } {
  const overall = (scores.tajwid + scores.fashoha + scores.tartil) / 3;

  let grade: string;
  let passed: boolean;

  if (overall >= 90) {
    grade = "Mumtaz"; // Excellent
    passed = true;
  } else if (overall >= 80) {
    grade = "Jayyid Jiddan"; // Very Good
    passed = true;
  } else if (overall >= 70) {
    grade = "Jayyid"; // Good
    passed = true;
  } else if (overall >= 60) {
    grade = "Maqbul"; // Acceptable
    passed = true;
  } else {
    grade = "Rasib"; // Failed
    passed = false;
  }

  return { overall, grade, passed };
}
```

---

## 5. Dashboard & Analytics API

**Refs:** [Req 9.1] [DB 6.1, 6.2]

### 5.1 Module: yayasan-dashboard

#### 5.1.1 Endpoints

| Method | Endpoint                  | Description                  | Auth     |
| ------ | ------------------------- | ---------------------------- | -------- |
| GET    | /api/dashboard/overview   | Get overview metrics         | YAYASAN+ |
| GET    | /api/dashboard/units      | Get per-unit metrics         | YAYASAN+ |
| GET    | /api/dashboard/comparison | Get unit comparison          | YAYASAN+ |
| GET    | /api/dashboard/trends     | Get trend data               | YAYASAN+ |
| GET    | /api/dashboard/alerts     | Get active alerts            | YAYASAN+ |
| POST   | /api/dashboard/snapshot   | Trigger snapshot calculation | ADMIN    |

#### 5.1.2 Response Schemas

**Overview Metrics:**

```typescript
// GET /api/dashboard/overview
// Response
{
  "success": true,
  "data": {
    "asOf": "2025-12-05T10:00:00Z",
    "students": {
      "total": 1250,
      "byUnit": {
        "PAUD": 150,
        "TK": 100,
        "SD_IT": 400,
        "SMP_IT": 300,
        "SMA_QURAN": 300
      },
      "trend": { "direction": "up", "percentage": 5.2 }
    },
    "attendance": {
      "today": {
        "rate": 94.5,
        "present": 1181,
        "absent": 69
      },
      "weekly": { "average": 93.2 }
    },
    "finance": {
      "monthlyIncome": 850000000,
      "vsTarget": 102.5,
      "overdue": { "count": 45, "amount": 125000000 }
    },
    "tahfidz": {
      "activeEnrollments": 450,
      "completedThisMonth": 12,
      "averageProgress": 65.5
    },
    "recentAchievements": [
      { "type": "ACADEMIC", "title": "Juara 1 OSN", "student": "Ahmad", "unit": "SMP_IT" },
      { "type": "TAHFIDZ", "title": "Khatam 30 Juz", "student": "Fatimah", "unit": "SMA_QURAN" }
    ]
  }
}
```

**Unit Comparison:**

```typescript
// GET /api/dashboard/comparison
// Query: metric (attendance|tahfidz|finance|academic), period
// Response
{
  "success": true,
  "data": {
    "metric": "attendance",
    "period": "monthly",
    "units": [
      { "unitId": "u1", "name": "SD IT", "value": 95.2, "rank": 1 },
      { "unitId": "u2", "name": "SMP IT", "value": 93.8, "rank": 2 },
      { "unitId": "u3", "name": "SMA Al-Qur'an", "value": 92.1, "rank": 3 },
      { "unitId": "u4", "name": "PAUD", "value": 91.5, "rank": 4 }
    ],
    "average": 93.15
  }
}
```

**Alerts:**

```typescript
// GET /api/dashboard/alerts
// Response
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "a1",
        "type": "FINANCE",
        "severity": "high",
        "title": "Tunggakan meningkat",
        "message": "45 siswa dengan tunggakan > 2 bulan",
        "unitId": "u1",
        "actionUrl": "/finance/overdue"
      },
      {
        "id": "a2",
        "type": "COMPLIANCE",
        "severity": "medium",
        "title": "Dokumen expired",
        "message": "Akreditasi SD IT expired dalam 30 hari",
        "unitId": "u1",
        "actionUrl": "/compliance/accreditation"
      }
    ],
    "summary": { "high": 1, "medium": 2, "low": 5 }
  }
}
```

---

## 6. Business Logic & Services

**Refs:** [Req 3], [Req 4], [Req 5], [Req 6], [Req 7], [Req 8]

### 6.1 PAUD Assessment Service

```typescript
// paud-assessment.service.ts

class PAUDAssessmentService {
  /**
   * Generate narrative from assessments
   * Refs: [Req 4.2.2]
   */
  async generateNarrativeReport(
    studentId: string,
    academicYearId: string,
    semesterId: string,
  ): Promise<PAUDNarrativeReport> {
    // 1. Get all assessments for the semester
    const assessments = await this.getAssessmentsBySemester(
      studentId,
      academicYearId,
      semesterId,
    );

    // 2. Validate minimum assessments per aspect
    const aspectCounts = this.countByAspect(assessments);
    for (const aspect of Object.values(PAUDAspect)) {
      if ((aspectCounts[aspect] || 0) < 3) {
        throw new Error(`Minimum 3 assessments required for ${aspect}`);
      }
    }

    // 3. Generate narrative per aspect
    const narratives = {};
    for (const aspect of Object.values(PAUDAspect)) {
      narratives[`narrative${aspect}`] = this.generateAspectNarrative(
        assessments.filter((a) => a.aspect === aspect),
      );
    }

    // 4. Generate overall summary
    const overallStrengths = this.identifyStrengths(assessments);
    const areasForDevelopment = this.identifyDevelopmentAreas(assessments);

    // 5. Calculate attendance summary
    const attendance = await this.getAttendanceSummary(
      studentId,
      academicYearId,
      semesterId,
    );

    // 6. Create report
    return prisma.pAUDNarrativeReport.create({
      data: {
        studentId,
        academicYearId,
        semesterId,
        ...narratives,
        overallStrengths,
        areasForDevelopment,
        ...attendance,
        status: "DRAFT",
      },
    });
  }

  /**
   * Calculate achievement trend
   */
  private calculateTrend(
    assessments: PAUDDevelopmentAssessment[],
  ): "improving" | "stable" | "declining" {
    if (assessments.length < 2) return "stable";

    const levelValues = { BB: 1, MB: 2, BSH: 3, BSB: 4 };
    const sorted = assessments.sort(
      (a, b) =>
        new Date(a.periodDate).getTime() - new Date(b.periodDate).getTime(),
    );

    const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
    const secondHalf = sorted.slice(Math.floor(sorted.length / 2));

    const avgFirst = this.average(
      firstHalf.map((a) => levelValues[a.achievementLevel]),
    );
    const avgSecond = this.average(
      secondHalf.map((a) => levelValues[a.achievementLevel]),
    );

    if (avgSecond > avgFirst + 0.3) return "improving";
    if (avgSecond < avgFirst - 0.3) return "declining";
    return "stable";
  }
}
```

### 6.2 Daily Report Service

```typescript
// daily-report.service.ts

class DailyReportService {
  /**
   * Send notification to parent
   * Refs: [Req 4.3.3]
   */
  async notifyParent(
    reportId: string,
    via: "whatsapp" | "push" | "email" | "all",
  ): Promise<NotificationResult> {
    const report = await this.getReportWithStudent(reportId);

    // Get parent contacts
    const parents = await this.getStudentParents(report.studentId);

    if (parents.length === 0) {
      throw new Error("No parent contacts found");
    }

    // Build notification message
    const message = this.buildNotificationMessage(report);

    const results = [];

    for (const parent of parents) {
      if (via === "whatsapp" || via === "all") {
        if (parent.whatsappNumber) {
          results.push(
            await this.whatsappService.send(
              parent.whatsappNumber,
              message,
              report.photos,
            ),
          );
        }
      }

      if (via === "push" || via === "all") {
        if (parent.fcmToken) {
          results.push(
            await this.pushService.send(
              parent.fcmToken,
              "Laporan Harian",
              message.summary,
            ),
          );
        }
      }

      if (via === "email" || via === "all") {
        if (parent.email) {
          results.push(
            await this.emailService.send(
              parent.email,
              "Laporan Harian " + report.student.name,
              message.html,
            ),
          );
        }
      }
    }

    // Update report
    await prisma.dailyStudentReport.update({
      where: { id: reportId },
      data: {
        notifiedAt: new Date(),
        notifiedVia: via,
      },
    });

    return { success: true, sent: results.length };
  }

  /**
   * Build WhatsApp message template
   */
  private buildNotificationMessage(
    report: DailyStudentReport,
  ): NotificationMessage {
    const unitTemplates = {
      PAUD: this.buildPAUDMessage,
      TK: this.buildPAUDMessage,
      SD_IT: this.buildSDITMessage,
    };

    const builder = unitTemplates[report.unitType] || this.buildGenericMessage;
    return builder(report);
  }

  private buildPAUDMessage(report: DailyStudentReport): NotificationMessage {
    const moodEmoji = {
      HAPPY: "😊",
      NEUTRAL: "😐",
      SAD: "😢",
      TIRED: "😴",
      EXCITED: "🤩",
      SICK: "🤒",
    };

    return {
      summary: `Laporan ${report.student.name} - ${formatDate(report.reportDate)}`,
      text: `
📝 *Laporan Harian PAUD*

👤 *${report.student.name}*
📅 ${formatDate(report.reportDate)}

🎭 Mood: ${moodEmoji[report.mood] || "😊"}
🩺 Kesehatan: ${report.healthStatus || "Sehat"}

🍽️ Makan: ${report.mealStatus || "-"}
🍪 Snack: ${report.snackStatus || "-"}
😴 Tidur: ${report.napDuration ? report.napDuration + " menit" : "-"}

📋 *Kegiatan:*
${report.activitiesSummary || "-"}

✨ *Prestasi:*
${report.achievements || "-"}

📝 *Catatan Guru:*
${report.teacherNotes || "-"}

🏠 *PR di Rumah:*
${report.homeActivity || "-"}
      `.trim(),
    };
  }
}
```

### 6.3 Murojaah Service

```typescript
// murojaah.service.ts

class MurojaahService {
  /**
   * Get recommended murojaah schedule
   * Refs: [Req 7.1.2]
   */
  async getMurojaahSchedule(studentId: string): Promise<MurojaahSchedule> {
    // Get student's current hafalan progress
    const enrollment = await this.getTakhosusEnrollment(studentId);
    const currentJuz = enrollment?.currentJuz || 1;
    const completedJuz = enrollment?.completedJuz || 0;

    // Calculate recommended murojaah based on hafalan amount
    const schedule = {
      yaumiyah: this.calculateYaumiyahTarget(completedJuz),
      usbuiyah: this.calculateUsbuiyahTarget(completedJuz),
      syahriyah: this.calculateSyahriyahTarget(completedJuz),
    };

    // Get recent murojaah to check completion
    const recentMurojaah = await this.getRecentMurojaah(studentId);

    return {
      studentId,
      currentHafalan: `${completedJuz} juz`,
      schedule,
      todayTarget: this.getTodayTarget(schedule, recentMurojaah),
      weeklyProgress: this.calculateWeeklyProgress(recentMurojaah, schedule),
    };
  }

  /**
   * Calculate yaumiyah (daily) target
   * Rule: Review last 1-3 juz of hafalan
   */
  private calculateYaumiyahTarget(completedJuz: number): MurojaahTarget {
    const juzToReview = Math.min(3, completedJuz);
    return {
      type: "YAUMIYAH",
      frequency: "daily",
      juzCount: juzToReview,
      juzRange: {
        start: Math.max(1, completedJuz - juzToReview + 1),
        end: completedJuz,
      },
      estimatedMinutes: juzToReview * 15, // ~15 min per juz
    };
  }

  /**
   * Calculate usbuiyah (weekly) target
   * Rule: Review last 5-7 juz weekly
   */
  private calculateUsbuiyahTarget(completedJuz: number): MurojaahTarget {
    const juzToReview = Math.min(7, completedJuz);
    return {
      type: "USBUIYAH",
      frequency: "weekly",
      juzCount: juzToReview,
      juzRange: {
        start: Math.max(1, completedJuz - juzToReview + 1),
        end: completedJuz,
      },
      estimatedMinutes: juzToReview * 20,
    };
  }
}
```

### 6.4 Dashboard Snapshot Service

```typescript
// dashboard-snapshot.service.ts

class DashboardSnapshotService {
  /**
   * Calculate and store daily metrics
   * Refs: [Req 9.1.1]
   */
  async calculateDailySnapshot(): Promise<void> {
    const today = new Date();
    const units = await prisma.unit.findMany({ where: { deletedAt: null } });

    for (const unit of units) {
      // Student count
      await this.saveMetric(
        unit.id,
        "STUDENT_COUNT",
        await this.countStudents(unit.id),
        "DAILY",
        today,
      );

      // Attendance rate
      await this.saveMetric(
        unit.id,
        "ATTENDANCE_RATE",
        await this.calculateAttendanceRate(unit.id, today),
        "DAILY",
        today,
      );

      // Tahfidz progress (for relevant units)
      if (["SMP_IT", "SMA_QURAN", "PESANTREN"].includes(unit.type)) {
        await this.saveMetric(
          unit.id,
          "TAHFIDZ_PROGRESS",
          await this.calculateTahfidzProgress(unit.id),
          "DAILY",
          today,
        );
      }
    }

    // Yayasan-level (all units)
    await this.saveMetric(
      null,
      "TOTAL_STUDENTS",
      await this.countStudents(null),
      "DAILY",
      today,
    );
    await this.saveMetric(
      null,
      "OVERALL_ATTENDANCE",
      await this.calculateAttendanceRate(null, today),
      "DAILY",
      today,
    );
  }

  private async saveMetric(
    unitId: string | null,
    metricType: string,
    value: number,
    periodType: string,
    date: Date,
  ): Promise<void> {
    await prisma.dashboardMetricSnapshot.upsert({
      where: {
        unitId_metricType_periodType_periodDate: {
          unitId: unitId || "GLOBAL",
          metricType,
          periodType,
          periodDate: date,
        },
      },
      create: {
        unitId,
        metricType,
        metricValue: value,
        periodType,
        periodDate: date,
      },
      update: {
        metricValue: value,
        calculatedAt: new Date(),
      },
    });
  }
}
```

---

## 7. Authentication & Authorization

**Refs:** [Req 3.1], [Req 3.2], [Req 11.2]

### 7.1 New Role Permissions

```typescript
// Role-based access for new modules
const MODULE_PERMISSIONS = {
  "paud-assessment": {
    create: [
      "PAUD_GURU",
      "PAUD_PENDAMPING",
      "PAUD_KEPALA_SEKOLAH",
      "PAUD_ADMIN",
    ],
    read: [
      "PAUD_GURU",
      "PAUD_PENDAMPING",
      "PAUD_KEPALA_SEKOLAH",
      "PAUD_ADMIN",
      "PAUD_ORANG_TUA",
    ],
    update: ["PAUD_GURU", "PAUD_KEPALA_SEKOLAH", "PAUD_ADMIN"],
    delete: ["PAUD_KEPALA_SEKOLAH", "PAUD_ADMIN"],
    finalize: ["PAUD_KEPALA_SEKOLAH", "PAUD_ADMIN"],
  },
  "daily-report": {
    create: ["*_GURU", "*_PENDAMPING"],
    read: ["*_GURU", "*_KEPALA_SEKOLAH", "*_ADMIN", "*_ORANG_TUA"],
    update: ["*_GURU"],
    delete: ["*_GURU", "*_KEPALA_SEKOLAH"],
    notify: ["*_GURU"],
  },
  murojaah: {
    create: ["MUHAFIDZ", "SMAQ_GURU", "SMPIT_GURU"],
    read: [
      "MUHAFIDZ",
      "MUSYRIF",
      "*_GURU",
      "*_ADMIN",
      "*_ORANG_TUA",
      "*_SISWA",
    ],
    update: ["MUHAFIDZ"],
    delete: ["MUHAFIDZ", "*_ADMIN"],
  },
  simaan: {
    create: ["MUHAFIDZ", "SMAQ_ADMIN"],
    read: ["MUHAFIDZ", "MUSYRIF", "*_GURU", "*_ADMIN"],
    update: ["MUHAFIDZ"],
    finalize: ["MUHAFIDZ", "SMAQ_KEPALA_SEKOLAH"],
  },
  "yayasan-dashboard": {
    read: [
      "YAYASAN_ADMIN",
      "YAYASAN_KETUA",
      "YAYASAN_SEKRETARIS",
      "YAYASAN_BENDAHARA",
      "SUPER_ADMIN",
    ],
  },
};
```

### 7.2 Middleware Enhancement

```typescript
// New middleware for module-based authorization
export const authorizeModule = (module: string, action: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRoles = await getUserRoles(req.user.id);
    const permissions = MODULE_PERMISSIONS[module]?.[action] || [];

    const hasPermission = userRoles.some((role) => {
      return permissions.some((p) => {
        if (p === role.code) return true;
        if (p.startsWith("*_")) {
          const suffix = p.substring(2);
          return role.code.endsWith("_" + suffix);
        }
        return false;
      });
    });

    if (!hasPermission) {
      throw Errors.forbidden("Insufficient permissions");
    }

    next();
  };
};
```

---

## 8. Error Handling

**Refs:** [Req 11.2]

### 8.1 Error Codes for New Modules

```typescript
export const ErrorCodes = {
  // PAUD Module
  PAUD_ASSESSMENT_NOT_FOUND: "PAUD_ASSESSMENT_NOT_FOUND",
  PAUD_INDICATOR_NOT_FOUND: "PAUD_INDICATOR_NOT_FOUND",
  PAUD_REPORT_ALREADY_FINALIZED: "PAUD_REPORT_ALREADY_FINALIZED",
  PAUD_INSUFFICIENT_ASSESSMENTS: "PAUD_INSUFFICIENT_ASSESSMENTS",

  // Daily Report Module
  DAILY_REPORT_NOT_FOUND: "DAILY_REPORT_NOT_FOUND",
  DAILY_REPORT_DUPLICATE: "DAILY_REPORT_DUPLICATE",
  DAILY_REPORT_INVALID_DATE: "DAILY_REPORT_INVALID_DATE",

  // Murojaah Module
  MUROJAAH_NOT_FOUND: "MUROJAAH_NOT_FOUND",
  MUROJAAH_INVALID_JUZ_RANGE: "MUROJAAH_INVALID_JUZ_RANGE",

  // Simaan Module
  SIMAAN_NOT_FOUND: "SIMAAN_NOT_FOUND",
  SIMAAN_ALREADY_FINALIZED: "SIMAAN_ALREADY_FINALIZED",
  SIMAAN_NO_EXAMINERS: "SIMAAN_NO_EXAMINERS",

  // Sanad Module
  SANAD_CERTIFICATE_EXISTS: "SANAD_CERTIFICATE_EXISTS",
  SANAD_NOT_ELIGIBLE: "SANAD_NOT_ELIGIBLE",
};
```

### 8.2 Error Response Examples

```json
// 404 Not Found
{
  "success": false,
  "error": {
    "code": "PAUD_ASSESSMENT_NOT_FOUND",
    "message": "PAUD assessment not found",
    "details": { "id": "uuid" }
  }
}

// 400 Bad Request
{
  "success": false,
  "error": {
    "code": "PAUD_INSUFFICIENT_ASSESSMENTS",
    "message": "Minimum 3 assessments required per aspect",
    "details": {
      "missing": ["NAM", "SNI"],
      "required": 3,
      "current": { "NAM": 2, "SNI": 1 }
    }
  }
}

// 409 Conflict
{
  "success": false,
  "error": {
    "code": "DAILY_REPORT_DUPLICATE",
    "message": "Daily report already exists for this student and date",
    "details": {
      "studentId": "uuid",
      "date": "2025-12-05",
      "existingReportId": "uuid"
    }
  }
}
```

---

## 9. Integration Services

**Refs:** [Req 10.1], [Req 10.2]

### 9.1 WhatsApp Integration Enhancement

```typescript
// whatsapp.service.ts

interface WhatsAppTemplates {
  DAILY_REPORT_PAUD: string;
  DAILY_REPORT_SD: string;
  TAHFIDZ_PROGRESS: string;
  MUROJAAH_REMINDER: string;
  SIMAAN_RESULT: string;
}

class WhatsAppService {
  private templates: WhatsAppTemplates = {
    DAILY_REPORT_PAUD: "daily_report_paud_v2",
    DAILY_REPORT_SD: "daily_report_sd_v1",
    TAHFIDZ_PROGRESS: "tahfidz_progress_v1",
    MUROJAAH_REMINDER: "murojaah_reminder_v1",
    SIMAAN_RESULT: "simaan_result_v1",
  };

  async sendDailyReport(
    phone: string,
    report: DailyStudentReport,
    photos: string[],
  ): Promise<SendResult> {
    const templateName =
      report.unitType === "SD_IT"
        ? this.templates.DAILY_REPORT_SD
        : this.templates.DAILY_REPORT_PAUD;

    return this.sendTemplate(
      phone,
      templateName,
      {
        studentName: report.student.name,
        date: formatDate(report.reportDate),
        mood: report.mood,
        summary: report.activitiesSummary,
        teacherNotes: report.teacherNotes,
      },
      photos,
    );
  }

  async sendSimaanResult(
    phone: string,
    simaan: SimaanExam,
  ): Promise<SendResult> {
    return this.sendTemplate(phone, this.templates.SIMAAN_RESULT, {
      studentName: simaan.student.name,
      examDate: formatDate(simaan.examDate),
      type: simaan.simaanType,
      juzRange: `${simaan.juzStart}-${simaan.juzEnd}`,
      score: simaan.overallScore,
      grade: simaan.grade,
      passed: simaan.passed ? "LULUS" : "TIDAK LULUS",
    });
  }
}
```

### 9.2 PDF Generation Service

```typescript
// pdf.service.ts

class PDFService {
  /**
   * Generate PAUD Narrative Report PDF
   * Refs: [Req 4.2.2]
   */
  async generatePAUDReport(reportId: string): Promise<Buffer> {
    const report = await this.getPAUDReportWithRelations(reportId);

    const template = await this.loadTemplate("paud_narrative_report");

    const html = this.renderTemplate(template, {
      // Header
      schoolName: report.student.unit.name,
      schoolLogo: report.student.unit.logoUrl,
      academicYear: report.academicYear.name,
      semester: report.semester.name,

      // Student Info
      studentName: report.student.user.name,
      studentNisn: report.student.nisn,
      className: report.student.class?.name,

      // Narratives
      narratives: {
        NAM: { title: "Nilai Agama & Moral", content: report.narrativeNAM },
        FM: { title: "Fisik Motorik", content: report.narrativeFM },
        KOG: { title: "Kognitif", content: report.narrativeKOG },
        BHS: { title: "Bahasa", content: report.narrativeBHS },
        SE: { title: "Sosial Emosional", content: report.narrativeSE },
        SNI: { title: "Seni", content: report.narrativeSNI },
      },

      // Summary
      overallStrengths: report.overallStrengths,
      areasForDevelopment: report.areasForDevelopment,
      parentRecommendations: report.parentRecommendations,

      // Attendance
      attendance: {
        totalDays: report.totalDays,
        presentDays: report.presentDays,
        sickDays: report.sickDays,
        excusedDays: report.excusedDays,
      },

      // Photos
      photos: report.photos.map((p) => p.photoUrl),

      // Signatures
      teacherSignature: report.teacherSignature,
      principalSignature: report.principalSignature,
      finalizedAt: formatDate(report.finalizedAt),
    });

    return this.htmlToPDF(html, {
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
    });
  }

  /**
   * Generate Sanad Certificate PDF
   * Refs: [Req 7.2.3]
   */
  async generateSanadCertificate(sanadId: string): Promise<Buffer> {
    const sanad = await this.getSanadWithRelations(sanadId);

    const template = await this.loadTemplate("sanad_certificate");

    const html = this.renderTemplate(template, {
      certificateNumber: sanad.certificateNumber,
      studentName: sanad.enrollment.student.user.name,
      juz: sanad.juz,
      grade: sanad.grade,
      teacherName: sanad.teacher.name,
      teacherSanadNumber: sanad.teacherSanadNumber,
      riwayat: sanad.riwayat,
      certifiedAt: formatDate(sanad.certifiedAt),
      verificationCode: sanad.verificationCode,
      qrCodeUrl: `https://cipansor.or.id/verify/${sanad.verificationCode}`,
    });

    return this.htmlToPDF(html, {
      format: "A4",
      landscape: true,
    });
  }
}
```

---

## Appendix A: API Summary Table

| Module            | Endpoints | Methods              | Auth Level         |
| ----------------- | --------- | -------------------- | ------------------ |
| paud-assessment   | 15        | CRUD + bulk          | PAUD_GURU+         |
| paud-reports      | 10        | CRUD + PDF           | PAUD_GURU+         |
| daily-report      | 14        | CRUD + notify        | GURU+              |
| murojaah          | 11        | CRUD + summary       | MUHAFIDZ+          |
| simaan            | 10        | CRUD + finalize      | MUHAFIDZ+          |
| sanad (enhanced)  | 3         | certificate + verify | MUHAFIDZ+ / PUBLIC |
| yayasan-dashboard | 6         | read                 | YAYASAN+           |
| **Total**         | **69**    | -                    | -                  |

---

## Appendix B: Cron Jobs / Scheduled Tasks

| Job                 | Schedule     | Description                       |
| ------------------- | ------------ | --------------------------------- |
| dailySnapshotJob    | 0 1 \* \* \* | Calculate daily dashboard metrics |
| murojaahReminderJob | 0 6 \* \* \* | Send murojaah reminders           |
| overdueAlertJob     | 0 8 \* \* 1  | Check finance overdue weekly      |
| reportGenerationJob | 0 0 1 _/6 _  | Auto-generate semester reports    |

---

**Status:** Draft - Awaiting Confirmation

**Next Step:** Konfirmasi Backend Design sebelum lanjut ke Frontend Design
