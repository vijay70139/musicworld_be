const mongoose = require("mongoose");

const ParticipantSchema = new mongoose.Schema({
  user: { type: String, required: true },
});

const RoomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    songs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Song" }],
    nowPlaying: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Song",
      default: null,
    },
    participants: { type: [ParticipantSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Room", RoomSchema);
