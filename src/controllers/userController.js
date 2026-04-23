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

    // Check if user already exists and increment verify counter
    let user = await User.findOneAndUpdate(
      { name: name.trim().toLowerCase() },
      { $inc: { verifyCount: 1 } },
      { new: true }
    );

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
