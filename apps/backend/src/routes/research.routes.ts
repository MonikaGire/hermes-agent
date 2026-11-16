import { Router } from 'express';
import { ResearchController } from '../controllers/research.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
const ctrl = new ResearchController();

router.use(authenticate);

router.get('/', ctrl.list.bind(ctrl));
router.get('/:companyId', ctrl.get.bind(ctrl));
router.post('/:companyId/run', ctrl.run.bind(ctrl));

export { router as researchRouter };
