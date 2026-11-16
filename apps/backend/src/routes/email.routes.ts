import { Router } from 'express';
import { EmailController } from '../controllers/email.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
const ctrl = new EmailController();

router.use(authenticate);

router.get('/', ctrl.list.bind(ctrl));
router.get('/:id', ctrl.get.bind(ctrl));
router.post('/generate', ctrl.generate.bind(ctrl));
router.post('/:id/send', ctrl.send.bind(ctrl));
router.post('/:id/regenerate', ctrl.regenerate.bind(ctrl));
router.patch('/:id', ctrl.update.bind(ctrl));
router.delete('/:id', ctrl.remove.bind(ctrl));

export { router as emailRouter };
