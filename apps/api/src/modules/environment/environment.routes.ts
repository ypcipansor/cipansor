import { Router } from 'express';
import * as controller from './environment.controller';

const router = Router();

// Public: whether this copy's documents are test copies (config.documents).
router.get('/', controller.show);

export default router;
