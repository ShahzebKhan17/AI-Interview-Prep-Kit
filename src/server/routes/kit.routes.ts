import { Router } from "express";
import {
  createKit,
  listKits,
  getKitById,
  updateKit,
  deleteKit,
} from "../controllers/kit.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

// All kit endpoints require authentication
router.use(requireAuth);

router.post("/", createKit);
router.get("/", listKits);
router.get("/:id", getKitById);
router.patch("/:id", updateKit);
router.delete("/:id", deleteKit);

export default router;
