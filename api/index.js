const express = require("express");
const router = express.Router();
const memberRouter = require("./member");
const boxRouter = require("./box");
const workFormulaRouter = require("./work-formula");

//Mount the routes
router.use("/member", memberRouter);
router.use("/box", boxRouter);
router.use("/work-formula", workFormulaRouter)

module.exports = router;