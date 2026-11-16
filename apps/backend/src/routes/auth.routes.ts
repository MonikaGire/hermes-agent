import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
const ctrl = new AuthController();

router.post('/register', ctrl.register.bind(ctrl));
router.post('/login', ctrl.login.bind(ctrl));
router.post('/logout', authenticate, ctrl.logout.bind(ctrl));
router.get('/me', authenticate, ctrl.me.bind(ctrl));
router.post('/refresh', ctrl.refresh.bind(ctrl));

export { router as authRouter };
