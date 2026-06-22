import express from "express";
import memberRouter from "./member.js";
import boxRouter from "./box.js";
import workFormulaRouter from "./workFormula.js";

const router = express.Router();

//Mount the routes
router.use("/member", memberRouter);
router.use("/box", boxRouter);
router.use("/work-formula", workFormulaRouter);

export default router;