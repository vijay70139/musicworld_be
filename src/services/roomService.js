const RoomModel = require("../models/Room");

let io = null;

module.exports = {
  init(ioInstance) {
    io = ioInstance;
  },

  // create room
  async createRoom(name, hostName) {
    try {
      const room = await RoomModel.create({
        name,
        participants: [
          {
            user: hostName,
            role: "host", // host permission
          },
        ],
        songs: [],
        nowPlaying: null,
      });

      return room.toObject();
    } catch (error) {
      console.error("createRoom failed:", error.message);
      throw new Error("Could not create room");
    }
  },

  async checkRoomExists(roomId) {
    try {
      const r =
        (await RoomModel.findById(roomId).lean()) ||
        (await RoomModel.findOne({ code: roomId }).lean());
      console.log("checkRoomExists found in DB:", !!r);
      return !!r;
    } catch (err) {
      console.log("checkRoomExists error:", err.message);
      return false;
    }
  },

  async getRoom(roomId) {
    try {
      const r = await RoomModel.findOne({ _id: roomId }).lean();
      if (r) return r;
    } catch (err) {}
    console.log("getRoom", err?.message);
  },

  async getAllRooms() {
    try {
      const rooms = await RoomModel.find({}, "_id name participants").lean();
      return rooms;
    } catch (err) {
      console.log("getAllRooms error:", err?.message);
      return [];
    }
  },

  async addParticipant(roomId, user) {
    try {
      let isUserAdded = null;
      let newParticipantAdded = null;
      const room = await RoomModel.findById(roomId);
      console.log("room: ", room);

      if (!room) return null; // ❌ Room not found

      // Generate unique participant ID
      const newParticipant = {
        user: user,
      };

      // Avoid duplicate join
      const alreadyExists = room.participants.some(
        (p) => p.user.toLowerCase() === user.toLowerCase()
      );

      if (!alreadyExists) {
        room.participants.push(newParticipant);
        await room.save();
        isUserAdded = true;
        newParticipantAdded = newParticipant;
      } else {
        isUserAdded = false;
      }

      return { room, isUserAdded, newParticipantAdded }; // ✔ sends updated list
    } catch (err) {
      console.error("addParticipant Service Error:", err.message);
      return null;
    }
  },

  async removeParticipantFromAll(socketId) {
    try {
      const rooms = await RoomModel.find({
        participants: { $elemMatch: { id: socketId } },
      });

      if (!rooms.length) return;

      await RoomModel.updateMany(
        {},
        { $pull: { participants: { id: socketId } } }
      );

      rooms.forEach((room) => {
        io.to(room._id.toString()).emit("participants_updated", {
          participants: room.participants.filter((p) => p.id !== socketId),
        });
      });
    } catch (err) {
      console.error("removeParticipantFromAll error:", err);
    }
  },

  async addSong(roomId, songData) {
    try {
      const room = await RoomModel.findById(roomId);

      if (!room) return null; // ❌ No room

      // Check if song already exists in playlist
      const alreadyExists = room.songs.some((s) => s.title === songData.title);

      if (!alreadyExists) {
        room.songs.push(songData);
         room.save();
      }

      return room.songs; // return updated playlist
    } catch (err) {
      console.error("addSong Service Error:", err.message);
      return null;
    }
  },

  async getPlaylist(roomId) {
    const r = await this.getRoom(roomId);
    return r ? r.songs || [] : [];
  },

  async setNowPlaying(roomId, title) {
    try {
      const room = await RoomModel.findOne({ _id: roomId });

      if (!room) return null;

      const songObj = room.songs.find(
        (song) => song.title.toLowerCase() === title.toLowerCase()
      );
      if (!songObj) return null;

      room.nowPlaying = songObj;
      await room.save();
      return songObj;
    } catch (err) {
      console.error("setNowPlaying service error:", err.message);
      return null;
    }
  },

  async getNowPlaying(roomId) {
    const r = await this.getRoom(roomId);
    return r ? r.nowPlaying : null;
  },

  async getParticipants(roomId) {
    const r = await this.getRoom(roomId);
    return r ? r.participants || [] : [];
  },

  async getRoomState(roomId) {
    const r = await this.getRoom(roomId);
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      songs: r.songs || [],
      nowPlaying: r.nowPlaying || null,
      participants: r.participants || [],
    };
  },

  async getParticipants(roomId) {
    const room = await RoomModel.findById(roomId).lean();
    return room?.participants || [];
  },

  async removeParticipant(roomId, userId) {
    try {
      const room = await RoomModel.findByIdAndUpdate(
        roomId,
        { $pull: { participants: { _id: userId } } },
        { new: true }
      );

      if (!room) {
        throw new Error("Room not found");
      }

      return room.participants;
    } catch (err) {
      console.error("Error removing participant:", err);
      throw err;
    }
  },

  async removeSong(roomId, title) {
    const room = await RoomModel.findByIdAndUpdate(
      roomId,
      { $pull: { songs: { title: title } } },
      { new: true }
    );

    return room?.songs || [];
  },

  async skipSong(roomId) {
    const room = await RoomModel.findById(roomId);

    if (!room) return null;

    const playlist = room.songs;
    const current = room.nowPlaying;

    if (!playlist.length) {
      return current;
    }

    if (current) {
      playlist.push(current);
    }

    const nextSong = playlist.shift();

    room.nowPlaying = nextSong;
    room.songs = playlist;

    await room.save();
    return nextSong;
  },
};
