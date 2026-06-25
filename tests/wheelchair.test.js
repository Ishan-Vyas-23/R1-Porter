'use strict';

/**
 * Wheelchair Service — Integration Tests
 *
 * Strategy:
 *   - Uses supertest to hit the Express app directly (no real HTTP port needed)
 *   - Mocks the database (pg pool) and JWT verification so tests run without
 *     a live PostgreSQL instance or real tokens
 *   - Covers the full request lifecycle and all authorization rules
 */

const request  = require('supertest');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = { v4: () => require('crypto').randomUUID() };

// ─── Mock pg before any app modules load ────────────────────────────────────
jest.mock('pg', () => {
  const mQuery  = jest.fn();
  const mRelease = jest.fn();
  const mConnect = jest.fn().mockResolvedValue({ query: mQuery, release: mRelease });
  const mPool   = {
    query:   mQuery,
    connect: mConnect,
    on:      jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

jest.mock('../src/services/google-routes.service', () => ({
  calculateRoute: jest.fn(),
}));

const { Pool } = require('pg');
const poolInstance = new Pool();
const googleRoutesService = require('../src/services/google-routes.service');

// ─── App (loads after mock is in place) ─────────────────────────────────────
process.env.JWT_SECRET    = 'test-secret';
process.env.JWT_ISSUER    = 'r1-auth-service';
process.env.NODE_ENV      = 'test';
process.env.LOG_LEVEL     = 'silent'; // suppress winston output during tests
process.env.GOOGLE_ROUTES_ENABLED = 'false';
process.env.GOOGLE_ROUTES_TIMEOUT_MS = '3000';

const app = require('../src/app');
const env = require('../src/config/env');

// ─── Token Helpers ───────────────────────────────────────────────────────────
const makeToken = (overrides = {}) =>
  jwt.sign(
    { id: 'user-uuid-001', name: 'Test User', email: 'test@r1.in', role: 'TOURIST', ...overrides },
    'test-secret'
  );

const touristToken   = makeToken({ role: 'TOURIST',              id: 'tourist-001',   name: 'Tourist One' });
const attendantToken = makeToken({ role: 'WHEELCHAIR_ATTENDANT', id: 'attendant-001', name: 'Attendant One' });
const adminToken     = makeToken({ role: 'ADMIN',                id: 'admin-001',     name: 'Admin User' });
const staffToken     = makeToken({ role: 'STATION_STAFF',        id: 'staff-001',     name: 'Staff User' });

// ─── Sample DB Rows ──────────────────────────────────────────────────────────
const sampleRequest = {
  id:                     'req-uuid-001',
  passenger_id:           'tourist-001',
  passenger_name:         'Tourist One',
  passenger_phone:        '+919876543210',
  station_code:           'ADI',
  platform_number:        '3',
  pickup_mode:            'CURRENT_LOCATION',
  pickup_address:         'Ahmedabad Junction Main Entrance',
  pickup_lat:             23.0225,
  pickup_lng:             72.5714,
  drop_address:           'Platform 3, Ahmedabad Junction',
  drop_lat:               23.0230,
  drop_lng:               72.5720,
  pickup_location:        'Main Entrance Gate',
  destination_location:   'Platform 3',
  accessibility_notes:    'Uses manual wheelchair',
  route_distance_meters:  null,
  route_duration_seconds: null,
  route_status:           'NOT_REQUESTED',
  route_calculated_at:    null,
  route_error:            null,
  status:                 'PENDING',
  assigned_attendant_id:  null,
  assigned_attendant_name: null,
  created_at:             new Date().toISOString(),
  updated_at:             new Date().toISOString(),
  cancelled_at:           null,
  completed_at:           null,
};

const acceptedRequest = {
  ...sampleRequest,
  status:                 'ACCEPTED',
  assigned_attendant_id:  'attendant-001',
  assigned_attendant_name: 'Attendant One',
};

const inProgressRequest = { ...acceptedRequest, status: 'IN_PROGRESS' };

// ─── Utility: reset mock between tests ──────────────────────────────────────
beforeEach(() => {
  poolInstance.query.mockReset();
  googleRoutesService.calculateRoute.mockReset();
  env.googleRoutes.enabled = false;
  env.googleRoutes.apiKey = '';
  env.googleRoutes.timeoutMs = 3000;
  // Default: testConnection SELECT NOW() always succeeds
  poolInstance.connect.mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [{ now: new Date() }] }),
    release: jest.fn(),
  });
});

// ════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ════════════════════════════════════════════════════════════════════════════
describe('GET /health', () => {
  it('returns 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION GUARD
// ════════════════════════════════════════════════════════════════════════════
describe('Authentication guard', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).post('/api/wheelchair/request').send({});
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await request(app)
      .post('/api/wheelchair/request')
      .set('Authorization', 'Bearer bad.token.here')
      .send({});
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ROLE GUARD
// ════════════════════════════════════════════════════════════════════════════
describe('Role guard', () => {
  it('returns 403 when ATTENDANT tries to create a request', async () => {
    const res = await request(app)
      .post('/api/wheelchair/request')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({ pickup_location: 'Gate 1' });
    expect(res.status).toBe(403);
  });

  it('returns 403 when TOURIST tries to view open requests', async () => {
    const res = await request(app)
      .get('/api/wheelchair/open-requests')
      .set('Authorization', `Bearer ${touristToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when TOURIST tries to view all requests', async () => {
    const res = await request(app)
      .get('/api/wheelchair/all')
      .set('Authorization', `Bearer ${touristToken}`);
    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/wheelchair/request — Create request
// ════════════════════════════════════════════════════════════════════════════
describe('POST /api/wheelchair/request', () => {
  it('creates a request successfully', async () => {
    poolInstance.query
      .mockResolvedValueOnce({ rows: [sampleRequest] }) // INSERT
      .mockResolvedValueOnce({ rows: [] });              // audit INSERT

    const res = await request(app)
      .post('/api/wheelchair/request')
      .set('Authorization', `Bearer ${touristToken}`)
      .send({
        passenger_name:       'Tourist One',
        passenger_phone:      '+919876543210',
        station_code:         'ADI',
        platform_number:      '3',
        pickup_mode:          'CURRENT_LOCATION',
        pickup_address:       'Ahmedabad Junction Main Entrance',
        pickup_lat:           23.0225,
        pickup_lng:           72.5714,
        drop_address:         'Platform 3, Ahmedabad Junction',
        drop_lat:             23.0230,
        drop_lng:             72.5720,
        pickup_location:      'Main Entrance Gate',
        destination_location: 'Platform 3',
        accessibility_notes:  'Uses manual wheelchair',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.passenger_id).toBe('tourist-001');
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.pickup_mode).toBe('CURRENT_LOCATION');
    expect(res.body.data.drop_address).toBe('Platform 3, Ahmedabad Junction');
  });

  it('rejects invalid coordinates', async () => {
    const res = await request(app)
      .post('/api/wheelchair/request')
      .set('Authorization', `Bearer ${touristToken}`)
      .send({ pickup_lat: 100, pickup_lng: 72.5714 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('creates a request with minimal fields (no optional fields)', async () => {
    poolInstance.query
      .mockResolvedValueOnce({ rows: [{ ...sampleRequest, passenger_name: 'Tourist One' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/wheelchair/request')
      .set('Authorization', `Bearer ${touristToken}`)
      .send({
        pickup_address: 'Gate 1',
        drop_address: 'Platform 3',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('accepts legacy location fields as backwards-compatible aliases', async () => {
    poolInstance.query
      .mockResolvedValueOnce({
        rows: [{
          ...sampleRequest,
          pickup_address: 'Old Gate',
          drop_address: 'Old Platform',
          pickup_location: 'Old Gate',
          destination_location: 'Old Platform',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/wheelchair/request')
      .set('Authorization', `Bearer ${touristToken}`)
      .send({
        pickup_location: 'Old Gate',
        destination_location: 'Old Platform',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pickup_address).toBe('Old Gate');
    expect(res.body.data.drop_address).toBe('Old Platform');
  });

  it('requires coordinates for current-location pickup', async () => {
    const res = await request(app)
      .post('/api/wheelchair/request')
      .set('Authorization', `Bearer ${touristToken}`)
      .send({
        pickup_mode: 'CURRENT_LOCATION',
        drop_address: 'Platform 3',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('requires a drop location', async () => {
    const res = await request(app)
      .post('/api/wheelchair/request')
      .set('Authorization', `Bearer ${touristToken}`)
      .send({ pickup_address: 'Gate 1' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('stores successful Google route estimates when enabled and coordinates exist', async () => {
    env.googleRoutes.enabled = true;
    env.googleRoutes.apiKey = 'test-google-key';
    googleRoutesService.calculateRoute.mockResolvedValue({
      distanceMeters: 450,
      durationSeconds: 360,
    });

    poolInstance.query
      .mockResolvedValueOnce({
        rows: [{
          ...sampleRequest,
          route_distance_meters: 450,
          route_duration_seconds: 360,
          route_status: 'SUCCESS',
          route_calculated_at: new Date().toISOString(),
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/wheelchair/request')
      .set('Authorization', `Bearer ${touristToken}`)
      .send({
        pickup_mode: 'CURRENT_LOCATION',
        pickup_lat: 23.0225,
        pickup_lng: 72.5714,
        drop_address: 'Platform 3',
        drop_lat: 23.0230,
        drop_lng: 72.5720,
      });

    expect(res.status).toBe(201);
    expect(googleRoutesService.calculateRoute).toHaveBeenCalledWith({
      pickup_lat: 23.0225,
      pickup_lng: 72.5714,
      drop_lat: 23.0230,
      drop_lng: 72.5720,
    });
    expect(res.body.data.route_status).toBe('SUCCESS');
    expect(res.body.data.route_distance_meters).toBe(450);
    expect(res.body.data.route_duration_seconds).toBe(360);
  });

  it('skips Google route estimates when enabled but coordinates are missing', async () => {
    env.googleRoutes.enabled = true;
    env.googleRoutes.apiKey = 'test-google-key';

    poolInstance.query
      .mockResolvedValueOnce({
        rows: [{
          ...sampleRequest,
          route_status: 'SKIPPED_MISSING_COORDINATES',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/wheelchair/request')
      .set('Authorization', `Bearer ${touristToken}`)
      .send({
        pickup_address: 'Gate 1',
        drop_address: 'Platform 3',
      });

    expect(res.status).toBe(201);
    expect(googleRoutesService.calculateRoute).not.toHaveBeenCalled();
    expect(res.body.data.route_status).toBe('SKIPPED_MISSING_COORDINATES');
  });

  it('creates the request when Google route calculation fails', async () => {
    env.googleRoutes.enabled = true;
    env.googleRoutes.apiKey = 'test-google-key';
    googleRoutesService.calculateRoute.mockRejectedValue(new Error('routes unavailable'));

    poolInstance.query
      .mockResolvedValueOnce({
        rows: [{
          ...sampleRequest,
          route_status: 'FAILED',
          route_error: 'routes unavailable',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/wheelchair/request')
      .set('Authorization', `Bearer ${touristToken}`)
      .send({
        pickup_mode: 'CURRENT_LOCATION',
        pickup_lat: 23.0225,
        pickup_lng: 72.5714,
        drop_address: 'Platform 3',
        drop_lat: 23.0230,
        drop_lng: 72.5720,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.route_status).toBe('FAILED');
    expect(res.body.data.route_error).toBe('routes unavailable');
  });

  it('rejects an invalid phone number', async () => {
    const res = await request(app)
      .post('/api/wheelchair/request')
      .set('Authorization', `Bearer ${touristToken}`)
      .send({ passenger_phone: 'not-a-phone' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.details).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/wheelchair/my-requests
// ════════════════════════════════════════════════════════════════════════════
describe('GET /api/wheelchair/my-requests', () => {
  it('returns the passenger\'s own requests', async () => {
    poolInstance.query.mockResolvedValueOnce({ rows: [sampleRequest] });

    const res = await request(app)
      .get('/api/wheelchair/my-requests')
      .set('Authorization', `Bearer ${touristToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].passenger_id).toBe('tourist-001');
  });

  it('returns an empty array when no requests exist', async () => {
    poolInstance.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/wheelchair/my-requests')
      .set('Authorization', `Bearer ${touristToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/wheelchair/:id — Get by ID
// ════════════════════════════════════════════════════════════════════════════
describe('GET /api/wheelchair/:id', () => {
  it('tourist can view their own request', async () => {
    poolInstance.query.mockResolvedValueOnce({ rows: [sampleRequest] });

    const res = await request(app)
      .get('/api/wheelchair/req-uuid-001')
      .set('Authorization', `Bearer ${touristToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('req-uuid-001');
  });

  it('tourist cannot view another passenger\'s request', async () => {
    const otherRequest = { ...sampleRequest, passenger_id: 'other-tourist-999' };
    poolInstance.query.mockResolvedValueOnce({ rows: [otherRequest] });

    const res = await request(app)
      .get('/api/wheelchair/req-uuid-001')
      .set('Authorization', `Bearer ${touristToken}`);

    expect(res.status).toBe(404);
  });

  it('attendant can view any request', async () => {
    poolInstance.query.mockResolvedValueOnce({ rows: [sampleRequest] });

    const res = await request(app)
      .get('/api/wheelchair/req-uuid-001')
      .set('Authorization', `Bearer ${attendantToken}`);

    expect(res.status).toBe(200);
  });

  it('returns 404 for non-existent request', async () => {
    poolInstance.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/wheelchair/non-existent-id')
      .set('Authorization', `Bearer ${touristToken}`);

    expect(res.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/wheelchair/:id/cancel
// ════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/wheelchair/:id/cancel', () => {
  it('passenger can cancel their own PENDING request', async () => {
    const cancelled = { ...sampleRequest, status: 'CANCELLED', cancelled_at: new Date().toISOString() };
    poolInstance.query
      .mockResolvedValueOnce({ rows: [sampleRequest] }) // findById
      .mockResolvedValueOnce({ rows: [cancelled] })     // updateStatus
      .mockResolvedValueOnce({ rows: [] });             // audit

    const res = await request(app)
      .patch('/api/wheelchair/req-uuid-001/cancel')
      .set('Authorization', `Bearer ${touristToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('passenger cannot cancel an already-accepted request', async () => {
    poolInstance.query.mockResolvedValueOnce({ rows: [acceptedRequest] });

    const res = await request(app)
      .patch('/api/wheelchair/req-uuid-001/cancel')
      .set('Authorization', `Bearer ${touristToken}`);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('passenger cannot cancel another passenger\'s request', async () => {
    const otherRequest = { ...sampleRequest, passenger_id: 'other-tourist-999' };
    poolInstance.query.mockResolvedValueOnce({ rows: [otherRequest] });

    const res = await request(app)
      .patch('/api/wheelchair/req-uuid-001/cancel')
      .set('Authorization', `Bearer ${touristToken}`);

    expect(res.status).toBe(409);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/wheelchair/open-requests
// ════════════════════════════════════════════════════════════════════════════
describe('GET /api/wheelchair/open-requests', () => {
  it('attendant can see all PENDING requests', async () => {
    poolInstance.query.mockResolvedValueOnce({ rows: [sampleRequest] });

    const res = await request(app)
      .get('/api/wheelchair/open-requests')
      .set('Authorization', `Bearer ${attendantToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].status).toBe('PENDING');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/wheelchair/:id/accept
// ════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/wheelchair/:id/accept', () => {
  it('attendant can accept a PENDING request', async () => {
    poolInstance.query
      .mockResolvedValueOnce({ rows: [sampleRequest] })  // findById
      .mockResolvedValueOnce({ rows: [acceptedRequest] }) // updateStatus
      .mockResolvedValueOnce({ rows: [] });               // audit

    const res = await request(app)
      .patch('/api/wheelchair/req-uuid-001/accept')
      .set('Authorization', `Bearer ${attendantToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACCEPTED');
    expect(res.body.data.assigned_attendant_id).toBe('attendant-001');
  });

  it('cannot accept a request that is already ACCEPTED', async () => {
    poolInstance.query.mockResolvedValueOnce({ rows: [acceptedRequest] });

    const res = await request(app)
      .patch('/api/wheelchair/req-uuid-001/accept')
      .set('Authorization', `Bearer ${attendantToken}`);

    expect(res.status).toBe(409);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/wheelchair/:id/status
// ════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/wheelchair/:id/status', () => {
  it('attendant can move ACCEPTED → IN_PROGRESS', async () => {
    const updated = { ...acceptedRequest, status: 'IN_PROGRESS' };
    poolInstance.query
      .mockResolvedValueOnce({ rows: [acceptedRequest] }) // findById
      .mockResolvedValueOnce({ rows: [updated] })         // updateStatus
      .mockResolvedValueOnce({ rows: [] });               // audit

    const res = await request(app)
      .patch('/api/wheelchair/req-uuid-001/status')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  it('rejects an invalid status transition (PENDING → COMPLETED)', async () => {
    poolInstance.query.mockResolvedValueOnce({ rows: [sampleRequest] }); // findById

    const res = await request(app)
      .patch('/api/wheelchair/req-uuid-001/status')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({ status: 'COMPLETED' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects a missing status field', async () => {
    const res = await request(app)
      .patch('/api/wheelchair/req-uuid-001/status')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('blocks a different attendant from updating an assigned request', async () => {
    const otherAttendantToken = makeToken({
      role: 'WHEELCHAIR_ATTENDANT',
      id: 'attendant-999',
      name: 'Another Attendant',
    });

    poolInstance.query.mockResolvedValueOnce({ rows: [acceptedRequest] }); // assigned to attendant-001

    const res = await request(app)
      .patch('/api/wheelchair/req-uuid-001/status')
      .set('Authorization', `Bearer ${otherAttendantToken}`)
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/wheelchair/:id/complete
// ════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/wheelchair/:id/complete', () => {
  it('attendant can complete an IN_PROGRESS request', async () => {
    const completed = { ...inProgressRequest, status: 'COMPLETED', completed_at: new Date().toISOString() };
    poolInstance.query
      .mockResolvedValueOnce({ rows: [inProgressRequest] }) // findById
      .mockResolvedValueOnce({ rows: [completed] })         // updateStatus
      .mockResolvedValueOnce({ rows: [] });                 // audit

    const res = await request(app)
      .patch('/api/wheelchair/req-uuid-001/complete')
      .set('Authorization', `Bearer ${attendantToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
  });

  it('cannot complete a PENDING request (invalid transition)', async () => {
    poolInstance.query.mockResolvedValueOnce({ rows: [sampleRequest] });

    const res = await request(app)
      .patch('/api/wheelchair/req-uuid-001/complete')
      .set('Authorization', `Bearer ${attendantToken}`);

    expect(res.status).toBe(409);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/wheelchair/all — Admin/Staff
// ════════════════════════════════════════════════════════════════════════════
describe('GET /api/wheelchair/all', () => {
  it('admin can view all requests', async () => {
    poolInstance.query.mockResolvedValueOnce({ rows: [sampleRequest, acceptedRequest] });

    const res = await request(app)
      .get('/api/wheelchair/all')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('station staff can view all requests', async () => {
    poolInstance.query.mockResolvedValueOnce({ rows: [sampleRequest] });

    const res = await request(app)
      .get('/api/wheelchair/all')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
  });

  it('attendant cannot access the all-requests endpoint', async () => {
    const res = await request(app)
      .get('/api/wheelchair/all')
      .set('Authorization', `Bearer ${attendantToken}`);

    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// STATUS TRANSITION UNIT TESTS (no HTTP, pure logic)
// ════════════════════════════════════════════════════════════════════════════
describe('Status transition rules (unit)', () => {
  const { canTransition } = require('../src/services/wheelchair-status.service');

  it('PENDING → ACCEPTED is valid', () => {
    expect(canTransition('PENDING', 'ACCEPTED').allowed).toBe(true);
  });

  it('PENDING → CANCELLED is valid', () => {
    expect(canTransition('PENDING', 'CANCELLED').allowed).toBe(true);
  });

  it('ACCEPTED → IN_PROGRESS is valid', () => {
    expect(canTransition('ACCEPTED', 'IN_PROGRESS').allowed).toBe(true);
  });

  it('IN_PROGRESS → COMPLETED is valid', () => {
    expect(canTransition('IN_PROGRESS', 'COMPLETED').allowed).toBe(true);
  });

  it('PENDING → COMPLETED is invalid', () => {
    const result = canTransition('PENDING', 'COMPLETED');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Cannot move from PENDING to COMPLETED');
  });

  it('COMPLETED → anything is invalid', () => {
    expect(canTransition('COMPLETED', 'PENDING').allowed).toBe(false);
    expect(canTransition('COMPLETED', 'ACCEPTED').allowed).toBe(false);
  });

  it('CANCELLED → anything is invalid', () => {
    expect(canTransition('CANCELLED', 'PENDING').allowed).toBe(false);
  });
});
