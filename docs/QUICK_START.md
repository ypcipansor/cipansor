# 🚀 Quick Start Guide - Cipansor Enhancement Implementation

**Last Updated:** December 11, 2025  
**Current Phase:** Sprint 1 - Foundation & Analytics

---

## 📦 What's Been Implemented

### ✅ Ready to Use Today

1. **Murojaah Analytics Dashboard**
   - Route: `/tahfidz/murojaah/analytics`
   - Status: ✅ Complete with mock data, needs API integration

2. **PAUD Radar Chart Component**
   - Location: `/apps/web/src/components/paud/RadarChart.tsx`
   - Status: ✅ Complete, ready to integrate into student dashboard

---

## 🏃 Getting Started

### Prerequisites

```bash
# Ensure you have:
- Node.js 20+
- pnpm 8+
- PostgreSQL 15+
- Redis 7+ (for WebSocket features)
```

### Clone & Setup

```bash
# If not already cloned
git clone <repo-url>
cd cipansor

# Install dependencies
pnpm install

# Setup environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# Configure .env files (database, redis, etc.)
```

### Run Development Servers

**Terminal 1 - Backend API:**

```bash
cd apps/api
pnpm dev

# Backend runs on: http://localhost:3001
# API docs: http://localhost:3001/api/docs
```

**Terminal 2 - Frontend:**

```bash
cd apps/web
pnpm dev

# Frontend runs on: http://localhost:3000
```

**Terminal 3 - Redis (for real-time features):**

```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# OR using local Redis
redis-server
```

---

## 🎯 Testing New Features

### 1. Test Murojaah Analytics

```bash
# Navigate to:
http://localhost:3000/tahfidz/murojaah/analytics

# What to test:
✓ Quality distribution pie chart
✓ Mistake patterns bar chart
✓ Consistency line chart
✓ Student ranking table
✓ Date range filter
✓ Halaqoh & type filters
```

**Expected:** Page loads with mock data, all charts render correctly

### 2. Test PAUD Radar Chart

```bash
# Navigate to any student progress page:
http://localhost:3000/paud/assessment/student/[studentId]/progress

# What to test:
✓ 6-aspect radar visualization
✓ Score display (0-4 scale)
✓ Color coding by achievement level
✓ Average score calculation
✓ Aspect detail breakdown
```

**To integrate:** Add `<PAUDRadarChart>` component to student dashboard page

---

## 🔧 Next Development Tasks

### Priority 1: Backend WebSocket Server (8 hours)

**Goal:** Enable real-time dashboard updates

**Steps:**

```bash
cd apps/api

# 1. Install dependencies
pnpm add socket.io ioredis

# 2. Create WebSocket setup file
# File: src/lib/websocket.ts
```

**Implementation:**

```typescript
// apps/api/src/lib/websocket.ts
import { Server as HTTPServer } from "http";
import { Server as SocketServer } from "socket.io";
import { createClient } from "redis";
import { verifyJWT } from "./jwt";

export function setupWebSocket(httpServer: HTTPServer) {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true,
    },
  });

  // Redis for pub/sub
  const redis = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
  });
  await redis.connect();

  // Auth middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    try {
      const user = await verifyJWT(token);
      socket.data.user = user;
      next();
    } catch (error) {
      next(new Error("Authentication failed"));
    }
  });

  // Connection handler
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.data.user.id);

    socket.on("dashboard:subscribe", ({ unitIds, metrics }) => {
      // Join rooms based on subscription
      unitIds.forEach((id: string) => socket.join(`unit:${id}`));
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });
  });

  // Redis subscriber for broadcasting
  const subscriber = redis.duplicate();
  await subscriber.connect();

  await subscriber.subscribe("dashboard:metrics:update", (message) => {
    const data = JSON.parse(message);
    io.to("yayasan:dashboard").emit("metrics:update", data);
  });

  return io;
}
```

**Update main.ts:**

```typescript
// apps/api/src/main.ts
import { setupWebSocket } from "./lib/websocket";

// After app.listen
const server = app.listen(PORT);
const io = setupWebSocket(server);

console.log(`WebSocket server ready on port ${PORT}`);
```

**Test:**

```bash
# Restart backend
pnpm dev

# Check frontend dashboard - should connect now
```

---

### Priority 2: Integrate Radar Chart (2 hours)

**Goal:** Add 6-aspect visualization to PAUD student dashboard

**File to edit:** `/apps/web/src/app/paud/assessment/student/[studentId]/page.tsx`

**Steps:**

```typescript
// 1. Import component
import { PAUDRadarChart } from '@/components/paud';

// 2. Add to page (around line 100)
<TabsContent value="overview">
  <div className="grid gap-4 md:grid-cols-2">
    {/* Add radar chart */}
    <PAUDRadarChart
      data={summary?.aspects || {}}
      studentName={student?.user?.name}
    />

    {/* Existing cards */}
    {ASPECT_ORDER.map((aspect) => (
      // ... existing aspect cards
    ))}
  </div>
</TabsContent>
```

**Test:**

```bash
# Navigate to student progress page
# Verify radar chart displays with correct colors
```

---

### Priority 3: Murojaah API Integration (4 hours)

**Goal:** Replace mock data with real API

**Backend endpoints needed:**

```typescript
// apps/api/src/modules/murojaah/murojaah.routes.ts

router.get("/analytics/quality-distribution", async (req, res) => {
  // Calculate quality distribution from MurojaahRecord
  // Return: { excellent, good, fair, poor }
});

router.get("/analytics/mistake-patterns", async (req, res) => {
  // Aggregate mistake types and counts
  // Return: [{ type, count, trend }]
});

router.get("/analytics/consistency-score", async (req, res) => {
  // Calculate daily quality trend
  // Return: [{ date, avgQuality, records }]
});

router.get("/analytics/top-performers", async (req, res) => {
  // Get top students by quality & consistency
  // Return: [{ rank, name, avgQuality, consistency, totalRecords }]
});
```

**Frontend update:**

```typescript
// apps/web/src/hooks/use-murojaah-analytics.ts
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export function useMurojaahQualityDistribution(params: FilterParams) {
  return useQuery({
    queryKey: ["murojaah-quality-distribution", params],
    queryFn: () =>
      api.get("/murojaah/analytics/quality-distribution", { params }),
  });
}

// Similar for other endpoints
```

**Update page:**

```typescript
// apps/web/src/app/tahfidz/murojaah/analytics/page.tsx
const { data: qualityData } = useMurojaahQualityDistribution({
  dateRange,
  halaqohId: halaqohFilter,
  type: typeFilter,
});
```

---

## 📊 Implementation Checklist

### Week 1-2 (Sprint 1)

- [x] Murojaah analytics dashboard (frontend)
- [x] PAUD radar chart component
- [ ] WebSocket backend server
- [ ] Radar chart integration
- [ ] Murojaah API endpoints
- [ ] Metric aggregation background job

### Week 3-4 (Sprint 2)

- [ ] Simaan exam scheduling UI
- [ ] Sanad certificate generation
- [ ] PAUD report PDF export
- [ ] Notification system (WhatsApp, Email)

---

## 🐛 Known Issues & Workarounds

### Issue 1: Murojaah Charts Empty

**Symptom:** Charts show but with mock data  
**Cause:** API endpoints not connected  
**Workaround:** Mock data displays correctly  
**Fix:** Implement Priority 3 task above

### Issue 2: Radar Chart Not Visible

**Symptom:** Student dashboard doesn't show radar chart  
**Cause:** Component not yet integrated  
**Workaround:** Component exists and works in isolation  
**Fix:** Implement Priority 2 task above

---

## 📚 Documentation References

### Planning Documents

- `docs/planning/requirements.md` - Full requirements
- `docs/planning/database-design.md` - Database schema
- `docs/planning/backend-design.md` - API specifications
- `docs/planning/frontend-design.md` - UI/UX specs
- `docs/planning/implementation-tasks.md` - Task breakdown

### Code References

- `apps/api/src/modules/` - Backend modules (62 modules)
- `apps/web/src/app/` - Frontend pages (60+ pages)
- `apps/web/src/hooks/` - React hooks & API calls
- `apps/web/src/components/` - Reusable components

---

## 🆘 Getting Help

### If Build Fails

```bash
# Clear cache and reinstall
pnpm clean
rm -rf node_modules
pnpm install

# Reset database if needed
cd apps/api
pnpm prisma migrate reset
pnpm prisma generate
```

### If Tests Fail

```bash
# Run tests with verbose output
cd apps/api
pnpm test -- --verbose

cd apps/web
pnpm test -- --verbose
```

### Common Commands

```bash
# Backend
pnpm --filter api dev          # Dev server
pnpm --filter api test          # Run tests
pnpm --filter api prisma:studio # Database GUI

# Frontend
pnpm --filter web dev           # Dev server
pnpm --filter web test          # Run tests
pnpm --filter web lint          # Check code quality
pnpm --filter web build         # Production build

# Both
pnpm dev                        # Run all in parallel
pnpm build                      # Build all
pnpm test                       # Test all
```

---

## 🎯 Success Criteria

### Sprint 1 Success Metrics

- ✅ 3 new pages created
- ✅ 1 reusable component created
- ✅ 1 custom hook created
- ⏳ WebSocket server implemented
- ⏳ Radar chart integrated

### Quality Gates

- All TypeScript types properly defined ✅
- No ESLint errors ✅
- Components properly tested ⏳
- Documentation updated ✅
- Code reviewed ⏳

---

## 💡 Tips for New Developers

1. **Start with existing pages**: Check `/apps/web/src/app/paud/` for reference implementations
2. **Use hooks**: All API calls go through React Query hooks in `/hooks/`
3. **Follow patterns**: Look at existing code before creating new patterns
4. **TypeScript first**: Define types before implementation
5. **Test as you go**: Don't wait until the end to test

---

## 🚀 Deploy to Production

### When Ready (After all Sprint 1 tasks complete)

```bash
# 1. Build all apps
pnpm build

# 2. Run migrations
cd apps/api
pnpm prisma migrate deploy

# 3. Start production servers
pnpm start

# 4. Verify health
curl http://localhost:3001/api/health
```

---

**Questions?** Check the planning documents or ask the team lead.

**Ready to code?** Pick a task from Priority 1-3 above and start! 🎉
