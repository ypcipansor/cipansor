import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { handleSingleUpload } from '../../middleware/upload';
import { uploadController } from './upload.controller';

const router = Router();

// Protect all upload routes
router.use(authenticate);

router.post('/', handleSingleUpload('file'), uploadController.uploadFile);

// Mint a short-lived SAS for a persisted stable blob URL at display/download
// time, so consumers store a link that never expires.
router.post('/sas', uploadController.getSasUrl);

export const uploadRoutes = router;
