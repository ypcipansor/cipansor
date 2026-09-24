import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/error';
import { walletService } from './wallet.service';
import { listWalletsQuerySchema, listTransactionsQuerySchema } from './wallet.schema';
import { ApiResponse } from '../../utils/response';

/**
 * List all wallets
 * GET /api/wallet
 */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = listWalletsQuerySchema.parse(req.query);
  const result = await walletService.listWallets(query);
  return res.json(ApiResponse.success(result.data, 'Daftar wallet berhasil diambil', result.meta));
});

/**
 * Wallet summary / statistics
 * GET /api/wallet/summary
 */
export const getSummary = asyncHandler(async (req: Request, res: Response) => {
  const { unitId } = req.query;
  const summary = await walletService.getSummary(unitId as string);
  return res.json(ApiResponse.success(summary, 'Summary wallet berhasil diambil'));
});

/**
 * List all transactions
 * GET /api/wallet/transactions
 */
export const listTransactions = asyncHandler(async (req: Request, res: Response) => {
  const query = listTransactionsQuerySchema.parse(req.query);
  const result = await walletService.listTransactions(query);
  return res.json(
    ApiResponse.success(result.data, 'Daftar transaksi berhasil diambil', result.meta)
  );
});

/**
 * Get wallet by student ID
 * GET /api/wallet/:studentId
 */
export const getByStudent = asyncHandler(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  const wallet = await walletService.getWalletByStudent(studentId);
  return res.json(ApiResponse.success(wallet, 'Wallet berhasil diambil'));
});

/**
 * Get transactions for a student
 * GET /api/wallet/:studentId/transactions
 */
export const getStudentTransactions = asyncHandler(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  const query = listTransactionsQuerySchema.parse({ ...req.query, studentId });
  const result = await walletService.listTransactions(query);
  return res.json(
    ApiResponse.success(result.data, 'Transaksi wallet berhasil diambil', result.meta)
  );
});

/**
 * Top up wallet
 * POST /api/wallet/topup
 */
export const topUp = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  const result = await walletService.topUp(req.body, userId);
  return res.status(201).json(ApiResponse.success(result, 'Top up berhasil'));
});

/**
 * Bulk top up wallets
 * POST /api/wallet/bulk-topup
 */
export const bulkTopUp = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  const result = await walletService.bulkTopUp(req.body, userId);
  return res.status(201).json(ApiResponse.success(result, 'Bulk top up selesai'));
});

/**
 * Deduct from wallet
 * POST /api/wallet/deduct
 */
export const deduct = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  const result = await walletService.deduct(req.body, userId);
  return res.json(ApiResponse.success(result, 'Pengurangan saldo berhasil'));
});

/**
 * Transfer between wallets
 * POST /api/wallet/transfer
 */
export const transfer = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  const result = await walletService.transfer(req.body, userId);
  return res.json(ApiResponse.success(result, 'Transfer berhasil'));
});

/**
 * Refund to wallet
 * POST /api/wallet/refund
 */
export const refund = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.sub;
  const result = await walletService.refund(req.body, userId);
  return res.json(ApiResponse.success(result, 'Refund berhasil'));
});
