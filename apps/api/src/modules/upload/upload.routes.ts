import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { handleSingleUpload } from '../../middleware/upload';
import { validate, validateQuery } from '../../middleware/error';
import { uploadController } from './upload.controller';
import { getSasUrlSchema, uploadQuerySchema } from './upload.schema';

const router = Router();

// Protect all upload routes
router.use(authenticate);

// `destination` is the caller's *purpose*; the middleware maps it to a
// container server-side. Validated at the edge so the parsed value comes from
// the schema (an unknown purpose can only collapse to private, never select a
// container). The resolver reads it out of `res.locals` — `req.query` is
// read-only in Express 5.
router.post('/',
  validateQuery(uploadQuerySchema),
  handleSingleUpload(
    'file',
    (_req, res) => (res.locals.validatedQuery as { destination?: string } | undefined)?.destination
  ),
  uploadController.uploadFile
);

// Mint a short-lived SAS for a persisted stable blob URL at display/download
// time, so consumers store a link that never expires. The body is validated at
// the edge (as everywhere else), so the controller receives a parsed `url`.
router.post('/sas', validate(getSasUrlSchema), uploadController.getSasUrl);

// Discard an upload whose follow-up record was never saved (orphan blob).
router.post('/discard', validate(getSasUrlSchema), uploadController.discardUpload);

export const uploadRoutes = router;
