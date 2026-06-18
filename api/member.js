const express = require("express");
const router = express.Router();


// "api/member/new-general"
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

// "api/member/new-admin"
router.post("/new", async (req, res) => {
  try {
    /*
    New document for MemberInfo Collection
      - MemberType will be 3 (for Admin)
      - State will be set to 1
    New document for PersonalInfo Collection
    will create a new document in the member collection
    will also need to create a new document for member snapshot
    new document in personalInfo 
    */
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// "api/member/update-hours"
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

// "api/member/update-dues"
router.patch("/update-dues", async (req, res) => {
  try {
    /*
    Find specific Member -> MemberInfo -> Dues
    Update/Create Due document
    */
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// "api/member/inactive"
router.patch("/inactive", async (req, res) => {
  try {
    /*
    Find specific Member
    Update their state to 3 (inactive) 
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

// "api/member/search-multiple"
router.get("/search-multiple", async (req, res) => {
  try {
    /*
    Find and return multiple member
    */
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

module.exports = router;