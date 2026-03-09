import express from "express";
import {
  getEligibleOrders,
  createWave,
  getAllWaves,
  getWaveById,
  releaseWave,
  cancelWave,
  getWaveStats,
  getWaveByOrderId,
} from "../controllers/pickWaveController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Statistics and helpers
router.get("/stats", getWaveStats);
router.get("/eligible-orders", getEligibleOrders);

// CRUD operations
router.post("/", createWave);
router.get("/", getAllWaves);
router.get("/:id", getWaveById);

// Wave actions
router.post("/:id/release", releaseWave);
router.post("/:id/cancel", cancelWave);
router.get("/order/:orderId/wave", getWaveByOrderId);

export default router;
