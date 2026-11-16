import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
const ctrl = new DashboardController();

router.use(authenticate);

router.get('/stats', ctrl.stats.bind(ctrl));
router.get('/activity', ctrl.activity.bind(ctrl));
router.get('/conversion', ctrl.conversion.bind(ctrl));

export { router as dashboardRouter };
