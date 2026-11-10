import { Router } from 'express';
import { z } from 'zod';
import { createGame, getCurrentRound, revealHint, submitGuess, advanceRound, getGameResults } from '../services/gameService.js';

const router = Router();
const createSchema = z.object({
  playerName: z.string().trim().min(1).max(40).default('Explorer'),
  mode: z.enum(['explorer', 'regional', 'challenge', 'practice']).default('explorer'),
  region: z.string().trim().max(80).nullable().optional(),
});
const guessSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const idSchema = z.string().uuid();
const validateId = (req, _res, next) => { try { idSchema.parse(req.params.gameId); next(); } catch { next(Object.assign(new Error('Invalid game ID'), { status: 400 })); } };
router.param('gameId', validateId);

router.post('/', async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const game = await createGame(input);
    res.status(201).json({ success: true, game });
  } catch (error) { next(error); }
});

router.get('/:gameId/round', async (req, res, next) => {
  try {
    const state = await getCurrentRound(req.params.gameId);
    if (!state) return res.status(404).json({ success: false, error: 'Game not found' });
    if (state.completed) return res.json({ success: true, completed: true });
    res.json({ success: true, round: state.publicRound });
  } catch (error) { next(error); }
});

router.post('/:gameId/hint', async (req, res, next) => {
  try { res.json({ success: true, ...await revealHint(req.params.gameId) }); }
  catch (error) { next(error); }
});

router.post('/:gameId/guess', async (req, res, next) => {
  try {
    const { lat, lng } = guessSchema.parse(req.body);
    res.json({ success: true, result: await submitGuess(req.params.gameId, lat, lng) });
  } catch (error) { next(error); }
});

router.post('/:gameId/next', async (req, res, next) => {
  try { res.json({ success: true, ...await advanceRound(req.params.gameId) }); }
  catch (error) { next(error); }
});

router.get('/:gameId/results', async (req, res, next) => {
  try {
    const results = await getGameResults(req.params.gameId);
    if (!results) return res.status(404).json({ success: false, error: 'Game not found' });
    res.json({ success: true, ...results });
  } catch (error) { next(error); }
});

export default router;
