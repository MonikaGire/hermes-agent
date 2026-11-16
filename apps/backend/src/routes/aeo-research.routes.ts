import { Router } from 'express';
import { AEOResearchController } from '../controllers/aeo-research.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
const ctrl = new AEOResearchController();

router.use(authenticate);

router.get('/:companyId', ctrl.get.bind(ctrl));
router.post('/:companyId/run', ctrl.run.bind(ctrl));

export { router as aeoResearchRouter };
