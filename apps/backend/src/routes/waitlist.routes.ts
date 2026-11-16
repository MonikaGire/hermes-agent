import { Router } from 'express';
import multer from 'multer';
import { WaitlistController } from '../controllers/waitlist.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
const ctrl = new WaitlistController();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Public webhook — called by ecommerce form (protected by x-api-key header)
router.post('/ingest', (req, res, next) => ctrl.ingest(req, res).catch(next));

// Protected dashboard routes
router.use(authenticate);
router.get('/', (req, res, next) => ctrl.list(req, res).catch(next));
router.get('/stats', (req, res, next) => ctrl.stats(req, res).catch(next));
router.post('/approve-all', (req, res, next) => ctrl.approveAll(req, res).catch(next));
router.post('/import-csv', upload.single('file'), (req, res, next) => ctrl.importCsv(req, res).catch(next));
router.post('/convert-all', (req, res, next) => ctrl.convertAll(req, res).catch(next));
router.post('/:id/approve', (req, res, next) => ctrl.approve(req, res).catch(next));
router.post('/:id/reject', (req, res, next) => ctrl.reject(req, res).catch(next));
router.post('/:id/convert', (req, res, next) => ctrl.convertToProspect(req, res).catch(next));
router.delete('/:id', (req, res, next) => ctrl.remove(req, res).catch(next));

export { router as waitlistRouter };
