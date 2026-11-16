import { Router } from 'express';
import { ProspectController } from '../controllers/prospect.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
const ctrl = new ProspectController();

router.use(authenticate);

router.get('/', ctrl.list.bind(ctrl));
router.get('/stats', ctrl.stats.bind(ctrl));
router.get('/:id', ctrl.get.bind(ctrl));
router.post('/', ctrl.create.bind(ctrl));
router.patch('/:id', ctrl.update.bind(ctrl));
router.delete('/:id', ctrl.remove.bind(ctrl));
router.post('/:id/research', ctrl.triggerResearch.bind(ctrl));
router.post('/:id/email', ctrl.triggerEmail.bind(ctrl));
router.post('/:id/find-contacts', ctrl.findContacts.bind(ctrl));

export { router as prospectRouter };
