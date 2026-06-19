import express from "express";

const router = express.Router();

// "api/work-formula/new"
router.post("/new", async (req, res) => {
  try {
    /*
   Will need to create new document in the WorkFormula Collection
    */
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// "api/work-formula/update"
router.patch("/update", async (req, res) => {
  try {
    /*
    Can update name, service type, or hours
    */
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// "api/work-formula/search"
router.get("/search", async (req, res) => {
  try {
    /*
    Find and return single work formula by name
    */
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

export default router;