const express = require("express");
const router = express.Router();
const controller = require("../controllers/roomController");

router.post("/create", controller.createRoom);
router.get("/getAllRooms", controller.getAllRooms);
router.get("/allsongs", controller.getAllSongs);
router.get("/:_id", controller.getRoom);
router.post("/:_id/songs", controller.addSong);
router.delete("/:_id/songs/:title", controller.removeSong);
router.get("/:_id/playlist", controller.getPlaylist);
router.get("/:_id/exists", controller.checkRoomExists);
router.post("/:_id/join", controller.joinRoom);
router.post("/:_id/nowplaying", controller.setNowPlaying);
router.get("/:_id/nowplaying", controller.getNowPlaying);
router.get("/:_id/participants", controller.getParticipants);
router.post("/:_id/leave", controller.leaveRoom);
router.post("/:_id/skip", controller.skipSong);
router.post("/:_id/removeParticipant", controller.removeParticipant);
router.post("/:_id/previous", controller.previousSong);

module.exports = router;
