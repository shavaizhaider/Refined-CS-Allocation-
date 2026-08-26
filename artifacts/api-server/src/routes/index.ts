import { Router, type IRouter } from "express";
import healthRouter from "./health";
import academicRouter from "./academic";
import authRouter from "./auth";

const router: IRouter = Router();
router.use(healthRouter);
router.use("/auth", authRouter);
router.use(academicRouter);

export default router;