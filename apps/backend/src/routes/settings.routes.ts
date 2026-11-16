import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller.js';
import { authenticate, authorize } from '../middleware/authenticate.js';

const router = Router();
const ctrl = new SettingsController();

router.use(authenticate);

router.get('/', ctrl.get.bind(ctrl));
router.patch('/', authorize('admin'), ctrl.update.bind(ctrl));
router.post('/test-email', ctrl.testEmail.bind(ctrl));
router.post('/test-openai', ctrl.testOpenAI.bind(ctrl));

export { router as settingsRouter };
