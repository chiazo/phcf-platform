const express = require("express");
const router = express.Router();

// "api/box/new"
router.post("/new", async (req, res) => {
  try {
    /*
    Will create a new BoxState 
    Create a new BoxInfo
    */
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// "api/box/update"
router.patch("/update", async (req, res) => {
  try {
    /*
    Can update any info in the box
      - If there are conflicting boxes it needs to error out
    */
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// "api/box/inactive"
router.patch("/inactive", async (req, res) => {
  try {
    /*
    Will make need to change the BoxState to 1 (invalid)
    Need to update it so that no members are not connected to this Box
    */
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// "api/box/search-single"
router.get("/search-number", async (req, res) => {
  try {
    /*
    Find and return single box by it's number
    */
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// "api/box/search-single"
router.get("/search-members", async (req, res) => {
  try {
    /*
    Find and return single box by members associated by it
    */
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

module.exports = router;