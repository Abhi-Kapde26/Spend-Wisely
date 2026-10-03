import { Router } from 'express';
import authRoutes from './auth.js';
import settingsRoutes from './settings.js';
import dashboardRoutes from './dashboard.js';
import transactionRoutes from './transactions.js';
import categoryRoutes from './categories.js';
import borrowLendRoutes from './borrowLend.js';
import budgetRoutes from './budgets.js';
import analyticsRoutes from './analytics.js';
import historyRoutes from './history.js';
import exportRoutes from './export.js';
import sheetsRoutes from './googleSheets.js';
import recurringRoutes from './recurring.js';
import importRoutes from './import.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/', settingsRoutes);        // POST /setup, GET|PUT /settings, PUT /settings/password
router.use('/dashboard', dashboardRoutes);
router.use('/transactions', transactionRoutes);
router.use('/categories', categoryRoutes);
router.use('/borrow-lend', borrowLendRoutes);
router.use('/budgets', budgetRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/', historyRoutes);         // /history, /monthly, /monthly/:year/:month
router.use('/export', exportRoutes);
router.use('/google-sheets', sheetsRoutes);
router.use('/recurring', recurringRoutes);
router.use('/import', importRoutes);      // Google Sheet / CSV import (SPEC §3.12)

export default router;
