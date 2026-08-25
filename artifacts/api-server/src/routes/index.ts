import { Router, type IRouter } from "express";
import healthRouter from "./health";
import academicRouter from "./academic";

const router: IRouter = Router();

router.use(healthRouter);
router.use(academicRouter);

export default router;
