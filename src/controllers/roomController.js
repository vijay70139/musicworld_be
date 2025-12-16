const RoomService = require("../services/roomService");

exports.createRoom = async (req, res) => {
  try {
    console.log(req.body, "createRoom body");
    const { name, userName } = req.body;

    if (!name || !userName) {
      return res.status(400).json({
        success: false,
        message: "Room name and user required",
      });
    }

    const room = await RoomService.createRoom(name, userName);

    return res.json({
      success: true,
      room,
    });
  } catch (err) {
    console.error("createRoom error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getRoom = async (req, res, next) => {
  try {
    const { _id } = req.params;
    const room = await RoomService.getRoom(_id);
    if (!room) return res.status(404).json({ error: "room_not_found" });
    res.json({ success: true, room });
  } catch (err) {
    next(err);
  }
};

exports.getAllRooms = async (req, res, next) => {
  try {
    const rooms = await RoomService.getAllRooms();
    res.json({ success: true, rooms });
  } catch (err) {
    next(err);
  }
};

exports.getPlaylist = async (req, res, next) => {
  try {
    const { _id } = req.params;
    const playlist = await RoomService.getPlaylist(_id);
    res.json({ success: true, playlist });
  } catch (err) {
    next(err);
  }
};

exports.checkRoomExists = async (req, res, next) => {
  try {
    const { _id } = req.params;
    const exists = await RoomService.checkRoomExists(_id);
    console.log("checkRoomExists:", exists);
    if (!exists) {
      return res.status(404).json({
        success: false,
        exists: false,
        message: "Room not found",
      });
    }

    return res.json({
      success: true,
      exists: true,
      roomId: _id,
    });
  } catch (err) {
    console.error("checkRoomExists Error:", err);
    return res.status(500).json({
      success: false,
      exists: false,
      message: "Internal server error",
    });
  }
};

exports.joinRoom = async (req, res) => {
  try {
    const { _id } = req.params;
    const { user } = req.body;

    if (!user || !user.trim()) {
      return res.status(400).json({
        success: false,
        message: "User name required",
      });
    }

    const participants = await RoomService.addParticipant(_id, user.trim());
    console.log("participants: ", participants);

    if (!participants.isUserAdded) {
      return res.status(404).json({
        success: false,
        message: "UserName already exists in room",
      });
    }

    return res.json({
      success: true,
      message: "Joined room successfully",
      room: participants.room,
      newParticipant: participants.room.participants.find(
        (p) => p.user === participants.newParticipantAdded.user
      ),
    });
  } catch (error) {
    console.error("joinRoom error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.addSong = async (req, res) => {
  try {
    const { _id: roomId } = req.params;
    const { title, url, duration } = req.body;

    if (!title || !url) {
      return res.status(400).json({
        success: false,
        message: "Song title and url are required",
      });
    }

    const song = { title, url, duration };
    const playlist = await RoomService.addSong(roomId, song);

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    return res.json({
      success: true,
      message: "Song added successfully",
      playlist,
    });
  } catch (error) {
    console.error("addSong Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

exports.setNowPlaying = async (req, res) => {
  const { _id } = req.params;
  const { title } = req.body;

  const nowPlaying = await RoomService.setNowPlaying(_id, title);

  if (!nowPlaying) {
    return res
      .status(404)
      .json({ success: false, message: "Song or Room not found" });
  }

  res.json({ success: true, nowPlaying });
};

exports.getNowPlaying = async (req, res) => {
  try {
    const { _id } = req.params;
    const nowPlaying = await RoomService.getNowPlaying(_id);
    res.json({ success: true, nowPlaying });
  } catch (err) {
    next(err);
  }
};

exports.getParticipants = async (req, res) => {
  try {
    const users = await RoomService.getParticipants(req.params._id);
    return res.json({ success: true, participants: users });
  } catch (e) {
    res.status(500).json({ success: false });
  }
};

exports.leaveRoom = async (req, res) => {
  try {
    const { userId } = req.body;
    const users = await RoomService.removeParticipant(req.params._id, userId);
    return res.json({ success: true, participants: users });
  } catch (e) {
    res.status(500).json({ success: false });
  }
};

exports.removeSong = async (req, res) => {
  try {
    const playlist = await RoomService.removeSong(
      req.params._id,
      req.params.title
    );
    return res.json({ success: true, playlist });
  } catch (e) {
    res.status(500).json({ success: false });
  }
};

exports.skipSong = async (req, res) => {
  try {
    const nextSong = await RoomService.skipSong(req.params._id);
    if (!nextSong)
      return res.status(404).json({ success: false, message: "No more songs" });

    // 🔥 Socket broadcast
    // global.io.to(req.params._id).emit("now-playing", nextSong);

    return res.json({ success: true, nowPlaying: nextSong });
  } catch (e) {
    res.status(500).json({ success: false });
  }
};

exports.previousSong = async (req, res) => {
  try {
    const result = await RoomService.previousSong(req.params._id);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "No previous song",
      });
    }

    return res.json({
      success: true,
      nowPlaying: result.nowPlaying,
      playlist: result.playlist,
    });
  } catch (e) {
    console.error("previousSong error:", e);
    return res.status(500).json({ success: false });
  }
};

exports.removeParticipant = async (req, res) => {
  try {
    const { userId } = req.body;
    const participants = await RoomService.removeParticipant(
      req.params._id,
      userId
    );
    return res.json({ success: true, participants });
  } catch (e) {
    res.status(500).json({ success: false });
  }
};

exports.getAllSongs = async (req, res) => {
  try {
    const songs = await RoomService.getAllSongs();
    return res.json({ success: true, songs });
  } catch (e) {
    res.status(500).json({ success: false });
  }
};
