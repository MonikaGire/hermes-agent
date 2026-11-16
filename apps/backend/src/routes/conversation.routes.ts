import { Router } from 'express';
import { ConversationController } from '../controllers/conversation.controller.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
const ctrl = new ConversationController();

router.use(authenticate);

router.get('/stats', ctrl.stats.bind(ctrl));
router.post('/poll-gmail', ctrl.pollGmail.bind(ctrl));
router.get('/', ctrl.list.bind(ctrl));
router.get('/:id', ctrl.get.bind(ctrl));
router.get('/:id/draft', ctrl.getDraft.bind(ctrl));
router.post('/:id/approve-draft', ctrl.approveDraft.bind(ctrl));
router.post('/:id/discard-draft', ctrl.discardDraft.bind(ctrl));
router.post('/:id/regenerate-draft', ctrl.regenerateDraft.bind(ctrl));
router.post('/:id/suppress', ctrl.suppress.bind(ctrl));
router.post('/:id/simulate-reply', ctrl.simulateReply.bind(ctrl));

export { router as conversationRouter };
