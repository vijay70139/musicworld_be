const express = require("express");
const router = express.Router();
const { verifyUser } = require("../controllers/userController");

router.post("/verify", verifyUser);

module.exports = router;
