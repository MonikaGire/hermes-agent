import { Router } from 'express';
import { CompanyController } from '../controllers/company.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
const ctrl = new CompanyController();

router.use(authenticate);

router.get('/', ctrl.list.bind(ctrl));
router.get('/:id', ctrl.get.bind(ctrl));
router.post('/', ctrl.create.bind(ctrl));
router.patch('/:id', ctrl.update.bind(ctrl));
router.delete('/:id', ctrl.remove.bind(ctrl));

export { router as companyRouter };
