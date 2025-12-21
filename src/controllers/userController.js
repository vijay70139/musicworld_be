const User = require("../models/User");

exports.verifyUser = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length < 2) {
      return res.json({
        success: false,
        message: "Invalid User",
      });
    }

    // Check if user already exists
    let user = await User.findOne({
      name: name.trim().toLowerCase(),
    });

    if (!user) {
      return res.json({
        success: false,
        message: "Invalid User",
      });
    }

    return res.json({
      success: true,
      user,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Username already taken",
      });
    }

    console.error("verifyUser error:", err);
    res.status(500).json({ success: false });
  }
};
