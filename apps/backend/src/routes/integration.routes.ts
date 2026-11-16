import { Router } from 'express';
import { IntegrationController } from '../controllers/integration.controller.js';
import { authenticate, authorize } from '../middleware/authenticate.js';

const router = Router();
const ctrl = new IntegrationController();

router.use(authenticate);

router.get('/', ctrl.list.bind(ctrl));
router.patch('/:provider', authorize('admin'), ctrl.update.bind(ctrl));
router.post('/serpapi/test', ctrl.testSerpApi.bind(ctrl));

export { router as integrationRouter };
