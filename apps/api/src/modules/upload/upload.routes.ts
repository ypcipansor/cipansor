import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { handleSingleUpload } from '../../middleware/upload';
import { validate } from '../../middleware/error';
import { uploadController } from './upload.controller';
import { getSasUrlSchema } from './upload.schema';

const router = Router();

// Protect all upload routes
router.use(authenticate);

router.post('/', handleSingleUpload('file'), uploadController.uploadFile);

// Mint a short-lived SAS for a persisted stable blob URL at display/download
// time, so consumers store a link that never expires. The body is validated at
// the edge (as everywhere else), so the controller receives a parsed `url`.
router.post('/sas', validate(getSasUrlSchema), uploadController.getSasUrl);

// Discard an upload whose follow-up record was never saved (orphan blob).
router.post('/discard', validate(getSasUrlSchema), uploadController.discardUpload);

export const uploadRoutes = router;
