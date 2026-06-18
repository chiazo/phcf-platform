const express = require("express");
const router = express.Router();

// "api/general-member/new"
router.post("/new", async (req, res) => {
  try {
    /*
    New document for MemberInfo Collection
      - MemberType will be 2 (for General)
      - State will be set to 1
    New document for PersonalInfo Collection
    Will also need to create a new document for MemberSnapshot
    Will create a new document in the Member collection
    */
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// "api/general-member/update-hours"
router.patch("/update-hours", async (req, res) => {
  try {
    /*
    Find specific Member -> MemberInfo -> Requirements -> ServiceRequirements
    Update hours_completed
    */
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// "api/member/search-single"
router.get("/search-single", async (req, res) => {
  try {
    /*
    Find and return single member
    */
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

module.exports = router;