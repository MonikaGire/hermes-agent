import { Router } from 'express';
import { ApprovalController } from '../controllers/approval.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
const ctrl = new ApprovalController();

router.use(authenticate);

router.get('/', ctrl.list.bind(ctrl));
router.get('/pending', ctrl.pending.bind(ctrl));
router.post('/:emailId/approve', ctrl.approve.bind(ctrl));
router.post('/:emailId/skip', ctrl.skip.bind(ctrl));
router.post('/:emailId/revise', ctrl.revise.bind(ctrl));

export { router as approvalRouter };
