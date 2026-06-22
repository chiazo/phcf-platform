import express from "express";

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

// "api/member/update"
router.patch("/update", async (req, res) => {
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

// "api/member/search"
router.get("/search", async (req, res) => {
  try {
    /*
    Find and return single member
    */
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});


export default router;