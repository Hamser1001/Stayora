import { Router } from 'express';
import { asyncHandler, fail } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { getExchangeRates } from '../services/exchangeRates.js';

const router = Router();
const CODE_RE = /^[A-Z]{3}$/;

/**
 * GET /api/currency/rates?base=EUR&symbols=USD,GBP
 * Any signed-in member needs rates because every role can see money.
 */
router.get(
  '/rates',
  requireAuth,
  asyncHandler(async (req, res) => {
    const base = String(req.query.base || 'EUR').toUpperCase();
    if (!CODE_RE.test(base)) fail('Choose a valid base currency.', 'VALIDATION_ERROR');

    const raw = String(req.query.symbols || '');
    const symbols = raw
      ? raw.split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
      : [];
    if (symbols.some((symbol) => !CODE_RE.test(symbol))) {
      fail('Choose valid target currencies.', 'VALIDATION_ERROR');
    }

    res.json({ data: await getExchangeRates({ base, symbols }) });
  }),
);

export default router;
