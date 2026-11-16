import { Router } from 'express';
import { DiscoveryController } from '../controllers/discovery.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
const ctrl = new DiscoveryController();

router.use(authenticate);
router.post('/search', (req, res, next) => ctrl.search(req, res).catch(next));
router.post('/scrape', (req, res, next) => ctrl.scrape(req, res).catch(next));
router.post('/import', (req, res, next) => ctrl.import(req, res).catch(next));
router.post('/maps-search', (req, res, next) => ctrl.mapsSearch(req, res).catch(next));

export { router as discoveryRouter };
