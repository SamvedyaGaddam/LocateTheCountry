import { Router } from 'express';
import { getAnalytics, getLeaderboard } from '../services/gameService.js';
const router = Router();
router.get('/', async (req, res, next) => {
  try { res.json({ success: true, ...(await getAnalytics(String(req.query.player || 'Explorer').slice(0, 40))) }); }
  catch (error) { next(error); }
});
router.get('/leaderboard', async (_req, res, next) => {
  try { res.json({ success: true, leaderboard: await getLeaderboard() }); }
  catch (error) { next(error); }
});
export default router;
